const { Schema, model, Types } = require('mongoose');

const messageSchema = new Schema(
  {
    sender: { type: Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Types.ObjectId, ref: 'User', required: true },
    listing: { type: Types.ObjectId, ref: 'Listing' },
    body: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

module.exports = model('Message', messageSchema);
