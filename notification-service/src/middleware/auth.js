const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3002';

const extractBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
};

const authenticateToken = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization || '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const response = await fetch(`${USER_SERVICE_URL}/api/users/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const verification = await response.json();
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
