const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function formatUser(user) {
  if (typeof user.toSafeObject === 'function') {
    return user.toSafeObject();
  }

  const { passwordHash, __v, ...rest } = user.toObject({ virtuals: true });
  return rest;
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSearchPayload(body) {
  const search = {
    name: body.name,
    areas: normalizeArray(body.areas),
    keywords: normalizeArray(body.keywords)
  };

  if (body.minPrice !== undefined && body.minPrice !== null && body.minPrice !== '') {
    search.minPrice = Number(body.minPrice);
  }

  if (body.maxPrice !== undefined && body.maxPrice !== null && body.maxPrice !== '') {
    search.maxPrice = Number(body.maxPrice);
  }

  if (body.minBedrooms !== undefined && body.minBedrooms !== null && body.minBedrooms !== '') {
    search.minBedrooms = Number(body.minBedrooms);
  }

  if (body.minBathrooms !== undefined && body.minBathrooms !== null && body.minBathrooms !== '') {
    search.minBathrooms = Number(body.minBathrooms);
  }

  return search;
}

router.get('/me', authenticate, (req, res) => {
  res.json(formatUser(req.user));
});

router.get('/me/saved-searches', authenticate, requireRole('user'), (req, res) => {
  res.json(req.user.savedSearches || []);
});

router.post('/me/saved-searches', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const payload = normalizeSearchPayload(req.body);

    if (!payload.name) {
      return res.status(400).json({ message: 'Saved search must have a name.' });
    }

    if (!payload.areas.length) {
      return res.status(400).json({ message: 'Provide at least one area for the search.' });
    }

    if (req.user.savedSearches.length >= 20) {
      return res.status(400).json({ message: 'Maximum number of saved searches reached (20).' });
    }

    req.user.savedSearches.push(payload);
    await req.user.save();

    const savedSearch = req.user.savedSearches[req.user.savedSearches.length - 1];
    res.status(201).json(savedSearch);
  } catch (error) {
    next(error);
  }
});

router.put('/me/saved-searches/:searchId', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const search = req.user.savedSearches.id(req.params.searchId);
    if (!search) {
      return res.status(404).json({ message: 'Saved search not found.' });
    }

    const payload = normalizeSearchPayload(req.body);

    Object.assign(search, payload);
    await req.user.save();

    res.json(search);
  } catch (error) {
    next(error);
  }
});

router.delete('/me/saved-searches/:searchId', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const search = req.user.savedSearches.id(req.params.searchId);
    if (!search) {
      return res.status(404).json({ message: 'Saved search not found.' });
    }

    search.deleteOne();
    await req.user.save();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
