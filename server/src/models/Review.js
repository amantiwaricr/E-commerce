'use strict';

const mongoose = require('mongoose');

const RATING_MIN = 1;
const RATING_MAX = 5;
const COMMENT_MAX = 1000;

/**
 * A customer's rating of one product. One per customer per product: rating
 * again edits the existing review rather than adding a second vote.
 *
 * Only a customer with a delivered order containing the product may write
 * one; `order` records which delivery qualified them.
 */
const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: {
      type: Number,
      required: true,
      min: RATING_MIN,
      max: RATING_MAX,
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number of stars' },
    },
    comment: { type: String, trim: true, maxlength: COMMENT_MAX, default: '' },
    // Set by an admin for abusive or off-topic reviews. Hidden reviews are
    // kept, and left out of the product's rating and the public list.
    isHidden: { type: Boolean, default: false, index: true },
    hiddenAt: { type: Date },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, isHidden: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
module.exports.RATING_MIN = RATING_MIN;
module.exports.RATING_MAX = RATING_MAX;
module.exports.COMMENT_MAX = COMMENT_MAX;
