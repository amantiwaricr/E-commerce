'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

const PRODUCT_CATEGORIES = ['Fresh Meat', 'Processed Meat', 'Marinated', 'Offal', 'Seafood'];
const PRODUCT_UNITS = ['kg', 'g', 'piece', 'pack'];

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    category: { type: String, required: true, enum: PRODUCT_CATEGORIES, index: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'kg' },
    stock: { type: Number, required: true, min: 0, default: 0 },
    images: {
      type: [String],
      default: [],
      validate: [(val) => val.length <= 8, 'A product can have at most 8 images'],
    },
    isAvailable: { type: Boolean, default: true, index: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, price: 1 });

/** Keeps the slug in sync with the name and guarantees uniqueness with a suffix. */
productSchema.pre('validate', async function ensureSlug(next) {
  try {
    if (!this.isModified('name') && this.slug) return next();
    const base = slugify(this.name || '', { lower: true, strict: true }) || 'product';
    let candidate = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.constructor.exists({ slug: candidate, _id: { $ne: this._id } })) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    this.slug = candidate;
    return next();
  } catch (err) {
    return next(err);
  }
});

/** A product can be added to a cart only when it is flagged available and in stock. */
productSchema.virtual('inStock').get(function inStock() {
  return this.isAvailable && this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
module.exports.PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;
module.exports.PRODUCT_UNITS = PRODUCT_UNITS;
