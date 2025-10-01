const express = require('express');
const Conversation = require('../models/Conversation');
const Listing = require('../models/Listing');
const { authenticate } = require('../middleware/auth');
const { sendConversationNotification } = require('../services/emailService');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 2000;

const populateConfig = [
  { path: 'listing', select: 'title area address agent' },
  { path: 'agent', select: 'fullName email company role' },
  { path: 'buyer', select: 'fullName email role' },
  { path: 'messages.sender', select: 'fullName email role' }
];

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id?.toString?.() || String(user._id),
    fullName: user.fullName || '',
    email: user.email || '',
    company: user.company || '',
    role: user.role || ''
  };
}

function sanitizeListing(listing) {
  if (!listing) {
    return null;
  }

  const location = listing.address
    ? {
        street: listing.address.street || '',
        city: listing.address.city || '',
        state: listing.address.state || '',
        postalCode: listing.address.postalCode || ''
      }
    : null;

  return {
    _id: listing._id?.toString?.() || String(listing._id),
    title: listing.title || 'Listing',
    area: listing.area || '',
    address: location
  };
}

function sanitizeConversation(conversation) {
  if (!conversation) {
    return null;
  }

  const obj = conversation.toObject({ virtuals: true });
  return {
    _id: obj._id?.toString?.() || String(obj._id),
    listing: sanitizeListing(obj.listing),
    agent: sanitizeUser(obj.agent),
    buyer: sanitizeUser(obj.buyer),
    messages: Array.isArray(obj.messages)
      ? obj.messages.map((message) => ({
          sender: sanitizeUser(message.sender),
          body: message.body,
          createdAt: message.createdAt
        }))
      : [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    lastMessageAt: obj.lastMessageAt
  };
}

async function populateConversation(conversation) {
  if (!conversation) {
    return null;
  }

  return conversation.populate(populateConfig);
}

async function notifyConversationParticipant(conversation, senderId, messageBody) {
  try {
    await sendConversationNotification(conversation, { senderId, messageBody });
  } catch (error) {
    console.error('Failed to send conversation notification email', error);
  }
}

function buildListQuery(user, { listingId }) {
  const query = {};
  if (user.role === 'agent') {
    query.agent = user._id;
  } else {
    query.buyer = user._id;
  }

  if (listingId) {
    query.listing = listingId;
  }

  return query;
}

function validateMessageBody(body) {
  if (typeof body !== 'string') {
    return null;
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return trimmed.slice(0, MAX_MESSAGE_LENGTH);
  }

  return trimmed;
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const query = buildListQuery(req.user, req.query);
    const conversations = await Conversation.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate(populateConfig);

    res.json(conversations.map(sanitizeConversation));
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { listingId, message } = req.body || {};
    const trimmed = validateMessageBody(message);

    if (!listingId) {
      return res.status(400).json({ message: 'listingId is required.' });
    }

    if (!trimmed) {
      return res.status(400).json({ message: 'Message cannot be empty.' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    if (String(listing.agent) === String(req.user._id)) {
      return res.status(403).json({ message: 'Agents cannot message their own listing as a buyer.' });
    }

    const existing = await Conversation.findOne({ listing: listingId, buyer: req.user._id });

    const conversation = existing ||
      new Conversation({
        listing: listingId,
        agent: listing.agent,
        buyer: req.user._id,
        messages: []
      });

    const now = new Date();
    conversation.messages.push({ sender: req.user._id, body: trimmed, createdAt: now });
    conversation.lastMessageAt = now;

    const wasNew = conversation.isNew;
    await conversation.save();
    await populateConversation(conversation);

    await notifyConversationParticipant(conversation, req.user?._id, trimmed);

    const payload = sanitizeConversation(conversation);
    res.status(wasNew ? 201 : 200).json(payload);
  } catch (error) {
    if (error.code === 11000) {
      error.status = 409;
      error.message = 'A conversation for this listing already exists.';
    }
    next(error);
  }
});

router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { message } = req.body || {};
    const trimmed = validateMessageBody(message);

    if (!trimmed) {
      return res.status(400).json({ message: 'Message cannot be empty.' });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    const isParticipant =
      String(conversation.agent) === String(req.user._id) ||
      String(conversation.buyer) === String(req.user._id);

    if (!isParticipant) {
      return res.status(403).json({ message: 'You are not part of this conversation.' });
    }

    const now = new Date();
    conversation.messages.push({ sender: req.user._id, body: trimmed, createdAt: now });
    conversation.lastMessageAt = now;
    await conversation.save();
    await populateConversation(conversation);

    await notifyConversationParticipant(conversation, req.user?._id, trimmed);

    const payload = sanitizeConversation(conversation);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
