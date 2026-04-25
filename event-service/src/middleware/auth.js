const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3002';

const extractBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
};

const verifyTokenWithUserService = async (token) => {
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
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/:id' },
  { method: 'GET', path: '/:id/availability' },
];

const isPublicRoute = (req, publicRoutes) => {
  return publicRoutes.some((route) => {
    if (route.method !== req.method) return false;
    
    // Simple path matching for / and exact matches
    if (route.path === req.path) return true;
    
    // Pattern matching for /:id
    if (route.path === '/:id') {
      const match = req.path.match(/^\/\d+$/);
      return !!match;
    }

    // Pattern matching for /:id/availability
    if (route.path === '/:id/availability') {
      const match = req.path.match(/^\/\d+\/availability$/);
      return !!match;
    }

    return false;
  });
};

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
