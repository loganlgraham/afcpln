const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { authenticate } = require('../middleware/auth');
const { sendMessageNotificationEmail } = require('../services/emailService');

const router = express.Router();

function formatMessage(message) {
  if (!message) {
    return null;
  }

  const formatted = message.toObject({ virtuals: true });
  delete formatted.__v;
  return formatted;
}

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { recipientId, listingId, body } = req.body || {};

    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: 'A valid recipientId is required.' });
    }

    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (!trimmedBody) {
      return res.status(400).json({ message: 'Message body is required.' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found.' });
    }

    let listing = null;
    if (listingId) {
      if (!mongoose.Types.ObjectId.isValid(listingId)) {
        return res.status(400).json({ message: 'Invalid listingId provided.' });
      }

      listing = await Listing.findById(listingId).populate('agent', 'fullName email role company phoneNumber');
      if (!listing) {
        return res.status(404).json({ message: 'Listing not found.' });
      }

      const listingAgentId = listing.agent?._id?.toString();
      if (
        listingAgentId &&
        listingAgentId !== req.user._id.toString() &&
        listingAgentId !== recipient._id.toString()
      ) {
        return res
          .status(400)
          .json({ message: 'Messages tied to a listing must include the listing agent as sender or recipient.' });
      }
    }

    const message = new Message({
      sender: req.user._id,
      recipient: recipient._id,
      listing: listing ? listing._id : undefined,
      body: trimmedBody
    });

    await message.save();

    const populated = await message.populate([
      { path: 'sender', select: 'fullName email role company phoneNumber' },
      { path: 'recipient', select: 'fullName email role company phoneNumber' },
      {
        path: 'listing',
        select: 'title area address agent',
        populate: { path: 'agent', select: 'fullName email role company phoneNumber' }
      }
    ]);

    let agentUser = null;
    let buyerUser = null;

    if (listing && listing.agent) {
      agentUser = listing.agent;
      if (listing.agent._id.toString() === populated.sender._id.toString()) {
        buyerUser = populated.recipient;
      } else if (listing.agent._id.toString() === populated.recipient._id.toString()) {
        buyerUser = populated.sender;
      }
    } else {
      agentUser = [populated.sender, populated.recipient].find((user) => user && user.role === 'agent') || null;
      buyerUser = [populated.sender, populated.recipient].find((user) => user && user.role !== 'agent') || null;
    }

    await sendMessageNotificationEmail({
      message: populated,
      sender: populated.sender,
      recipient: populated.recipient,
      listing: listing || populated.listing,
      agent: agentUser,
      buyer: buyerUser
    });

    res.status(201).json(formatMessage(populated));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
