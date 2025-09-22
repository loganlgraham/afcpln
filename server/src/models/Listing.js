const { Schema, model, Types } = require('mongoose');

const addressSchema = new Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true }
  },
  { _id: false }
);

const listingSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    bedrooms: { type: Number, required: true },
    bathrooms: { type: Number, required: true },
    squareFeet: { type: Number },
    area: { type: String, required: true },
    features: { type: [String], default: [] },
    images: { type: [String], default: [] },
    address: { type: addressSchema, required: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'pending', 'sold'],
      default: 'active'
    },
    agent: { type: Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

module.exports = model('Listing', listingSchema);
