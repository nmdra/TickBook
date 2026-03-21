import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../dtos/common.dto';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import { AuthenticatedUserPayload } from '../dtos/auth.dto';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const parseJwtPayload = (token: string): AuthenticatedUserPayload => {
  const decoded = jwt.verify(token, JWT_SECRET as Secret);

  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const payload = decoded as JwtPayload;
  const id = String(payload.id ?? '');
  const email = String(payload.email ?? '');
  const role = String(payload.role ?? '');

  if (!id || !role) {
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
  res: Response<ApiResponse>,
  next: NextFunction
): Response | void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    req.user = parseJwtPayload(token);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

export const authorizeAdmin = (
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Response | void => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
    });
  }

  next();
};
