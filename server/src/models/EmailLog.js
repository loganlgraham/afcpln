const { Schema, model, Types } = require('mongoose');

const emailLogSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    listing: { type: Types.ObjectId, ref: 'Listing' },
    message: { type: Types.ObjectId, ref: 'Message' },
    searchName: { type: String },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    transportResponse: { type: String }
  },
  { timestamps: true }
);

module.exports = model('EmailLog', emailLogSchema);
