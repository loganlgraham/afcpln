const jwt = require('jsonwebtoken');
const User = require('../models/User');

function extractToken(headerValue) {
  if (!headerValue) {
    return null;
  }

  const [type, token] = headerValue.split(' ');
  if (type !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
}

async function authenticate(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('Missing JWT secret. Set JWT_SECRET in the environment.');
    }

    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'User not found for token.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions for this operation.' });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
