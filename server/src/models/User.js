'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PASSWORD_ROUNDS = 12;

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: 'Home' },
    recipientName: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    street: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 80 },
    district: { type: String, trim: true, maxlength: 80 },
    landmark: { type: String, trim: true, maxlength: 160 },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never stores a plain password; `select: false` keeps the hash out of
    // ordinary queries so it cannot leak through a response by accident.
    passwordHash: { type: String, required: true, select: false },
    isEmailVerified: { type: Boolean, default: false },
    emailVerification: {
      // The 4-digit code is stored hashed, like a password.
      codeHash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
      attempts: { type: Number, default: 0, select: false },
      lastSentAt: { type: Date, select: false },
    },
    avatar: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    addresses: { type: [addressSchema], default: [] },
    favourites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

/** Hashes and stores a new password. */
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, PASSWORD_ROUNDS);
};

/**
 * Constant-time password check. Returns false rather than throwing when the
 * hash was not selected, so a caller cannot mistake a bug for a valid login.
 */
userSchema.methods.verifyPassword = async function verifyPassword(plain) {
  if (!this.passwordHash || !plain) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    role: this.role,
    phone: this.phone,
    isEmailVerified: this.isEmailVerified,
    addresses: this.addresses,
    favourites: (this.favourites || []).map((id) => id.toString()),
    isBlocked: this.isBlocked,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
