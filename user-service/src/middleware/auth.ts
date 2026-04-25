import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import { AuthenticatedUserPayload } from '../dtos/auth.dto';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const parseJwtPayload = (token: string): AuthenticatedUserPayload => {
  const decoded = jwt.verify(token, JWT_SECRET as Secret);

  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const payload = decoded as JwtPayload;
  const id = Number(payload.id);
  const email = String(payload.email ?? '');
  const role = String(payload.role ?? '');

  if (!Number.isInteger(id) || id <= 0 || !role) {
    throw new Error('Invalid token payload');
  }

  return {
    id,
    email,
    role,
    iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
  };
};

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  // Allow internal service token to bypass JWT verification
  if (INTERNAL_SERVICE_TOKEN && token === INTERNAL_SERVICE_TOKEN) {
    req.user = { id: 0, email: 'internal@service', role: 'service' };
    return next();
  }

  try {
    req.user = parseJwtPayload(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const authorizeAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }

  next();
};

export const authenticateInternalService = (
  req: Request,
  res: Response,
  next: NextFunction
): Response | void => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : undefined;
  const internalToken = req.headers['x-internal-token'];
  const token = bearerToken || (Array.isArray(internalToken) ? internalToken[0] : internalToken);

  if (!INTERNAL_SERVICE_TOKEN || token !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Invalid internal service token.' });
  }

  next();
};
