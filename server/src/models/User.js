const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const savedSearchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    areas: { type: [String], default: [] },
    minPrice: { type: Number },
    maxPrice: { type: Number },
    minBedrooms: { type: Number },
    minBathrooms: { type: Number },
    keywords: { type: [String], default: [] }
  },
  { timestamps: true }
);

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'agent', 'admin'],
      default: 'user'
    },
    phoneNumber: { type: String },
    company: { type: String },
    savedSearches: { type: [savedSearchSchema], default: [] }
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(password) {
  const saltRounds = 10;
  this.passwordHash = await bcrypt.hash(password, saltRounds);
};

userSchema.methods.validatePassword = async function validatePassword(password) {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const { passwordHash, __v, ...rest } = this.toObject({ virtuals: true });
  return rest;
};

module.exports = model('User', userSchema);
