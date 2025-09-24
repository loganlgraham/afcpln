const { Schema, model, Types } = require('mongoose');

const messageSchema = new Schema(
  {
    sender: { type: Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    listing: { type: Types.ObjectId, ref: 'Listing', required: true },
    agent: { type: Types.ObjectId, ref: 'User', required: true },
    buyer: { type: Types.ObjectId, ref: 'User', required: true },
    messages: { type: [messageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

conversationSchema.index({ listing: 1, buyer: 1 }, { unique: true });
conversationSchema.index({ agent: 1, lastMessageAt: -1 });
conversationSchema.index({ buyer: 1, lastMessageAt: -1 });

module.exports = model('Conversation', conversationSchema);
