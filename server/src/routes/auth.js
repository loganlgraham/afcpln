const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

function buildTokenPayload(user) {
  return {
    sub: user.id,
    role: user.role,
    email: user.email
  };
}

function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing JWT secret. Set JWT_SECRET in the environment.');
  }

  const payload = buildTokenPayload(user);
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

function sanitizeUser(user) {
  if (typeof user.toSafeObject === 'function') {
    return user.toSafeObject();
  }

  const { passwordHash, __v, ...rest } = user.toObject({ virtuals: true });
  return rest;
}

router.post('/register', async (req, res, next) => {
  try {
    const { fullName, email, password, role = 'user', phoneNumber, company } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'fullName, email, and password are required.' });
    }

    const normalizedRole = role === 'agent' ? 'agent' : 'user';

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const user = new User({ fullName, email, role: normalizedRole, phoneNumber, company });
    await user.setPassword(password);
    await user.save();

    const token = generateToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
