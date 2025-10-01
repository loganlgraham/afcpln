const express = require('express');
const Listing = require('../models/Listing');
const { authenticate, requireRole } = require('../middleware/auth');
const { notifyUsersForListing } = require('../services/listingNotifier');

const router = express.Router();

function buildFilters(query) {
  const filters = {};
  const { area, city, state, minPrice, maxPrice, minBedrooms, minBathrooms, agentId, status } = query;

  if (area) {
    filters.area = new RegExp(`^${area}$`, 'i');
  }

  if (city) {
    filters['address.city'] = new RegExp(`^${city}$`, 'i');
  }

  if (state) {
    filters['address.state'] = new RegExp(`^${state}$`, 'i');
  }

  if (status) {
    filters.status = status;
  }

  if (agentId) {
    filters.agent = agentId;
  }

  if (minPrice || maxPrice) {
    filters.price = {};
    if (minPrice) {
      filters.price.$gte = Number(minPrice);
    }
    if (maxPrice) {
      filters.price.$lte = Number(maxPrice);
    }
  }

  if (minBedrooms) {
    filters.bedrooms = { $gte: Number(minBedrooms) };
  }

  if (minBathrooms) {
    filters.bathrooms = { $gte: Number(minBathrooms) };
  }

  return filters;
}

function formatListing(listing) {
  if (!listing) {
    return null;
  }

  const result = listing.toObject({ virtuals: true });
  return result;
}

router.get('/', async (req, res, next) => {
  try {
    const filters = buildFilters(req.query);
    const listings = await Listing.find(filters)
      .sort({ createdAt: -1 })
      .populate('agent', 'fullName email company phoneNumber');

    res.json(listings.map(formatListing));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('agent', 'fullName email company phoneNumber');
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    res.json(formatListing(listing));
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireRole('agent'), async (req, res, next) => {
  try {
    const payload = { ...req.body, agent: req.user._id };
    const listing = new Listing(payload);
    await listing.save();

    await notifyUsersForListing(listing);

    const populated = await listing.populate('agent', 'fullName email company phoneNumber');
    res.status(201).json(formatListing(populated));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireRole('agent'), async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    if (listing.agent.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to modify this listing.' });
    }

    const updatableFields = [
      'title',
      'description',
      'price',
      'bedrooms',
      'bathrooms',
      'squareFeet',
      'area',
      'features',
      'images',
      'address',
      'status'
    ];

    updatableFields.forEach((field) => {
      if (typeof req.body[field] !== 'undefined') {
        listing[field] = req.body[field];
      }
    });

    await listing.save();

    const populated = await listing.populate('agent', 'fullName email company phoneNumber');
    res.json(formatListing(populated));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireRole('agent'), async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    if (listing.agent.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to delete this listing.' });
    }

    await listing.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
