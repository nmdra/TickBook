const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3002';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const extractBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
};

const verifyTokenWithUserService = async (token) => {
  if (INTERNAL_SERVICE_TOKEN && token === INTERNAL_SERVICE_TOKEN) {
    return { isValid: true, service: 'internal' };
  }

  const response = await fetch(`${USER_SERVICE_URL}/api/users/verify-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return { isValid: false };
  }

  return response.json();
};

const defaultPublicRoutes = [
  { method: 'GET', path: '/stripe/success' },
  { method: 'GET', path: '/stripe/cancel' },
  { method: 'POST', path: '/webhook' },
];

const isPublicRoute = (req, publicRoutes) =>
  publicRoutes.some((route) => route.method === req.method && route.path === req.path);

const authenticateToken = (publicRoutes = defaultPublicRoutes) => async (req, res, next) => {
  if (isPublicRoute(req, publicRoutes)) {
    return next();
  }

  const token = extractBearerToken(req.headers.authorization || '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verification = await verifyTokenWithUserService(token);

    if (!verification.isValid) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.auth = verification.user || { service: verification.service };
    return next();
  } catch (err) {
    return res.status(503).json({ error: 'Token validation service unavailable.' });
  }
};

module.exports = {
  authenticateToken,
};
