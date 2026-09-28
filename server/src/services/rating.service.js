'use strict';

const Product = require('../models/Product');
const Review = require('../models/Review');
const logger = require('../utils/logger');
const { RECENT_RATINGS, summariseRatings, initialOf } = require('../utils/reviews');

/** A product's rating figures, computed from its visible reviews. */
const ratingFor = async (productId) => {
  const [rows, recent] = await Promise.all([
    Review.aggregate([
      { $match: { product: productId, isHidden: false } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
    Review.find({ product: productId, isHidden: false })
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_RATINGS)
      .populate('user', 'name')
      .lean(),
  ]);
  const summary = summariseRatings(rows);
  return {
    summary,
    fields: {
      rating: summary.average,
      reviewCount: summary.count,
      recentRatings: recent.map((r) => ({ initial: initialOf(r.user?.name), rating: r.rating, at: r.createdAt })),
    },
  };
};

/**
 * Recomputes one product's rating after a review is added, edited, hidden or
 * removed. Returns the summary so the caller can hand it straight back.
 */
const refreshProductRating = async (productId) => {
  const { summary, fields } = await ratingFor(productId);
  await Product.updateOne({ _id: productId }, { $set: fields });
  return summary;
};

/**
 * Brings every product's rating in line with its reviews. Run at start-up: it
 * repairs anything written outside the review flow (older seed data carried
 * invented ratings), and costs one aggregate per product.
 */
const syncAllProductRatings = async () => {
  const products = await Product.find({}).select('rating reviewCount').lean();
  let corrected = 0;
  for (const product of products) {
    // eslint-disable-next-line no-await-in-loop
    const { fields } = await ratingFor(product._id);
    const stale = product.rating !== fields.rating || product.reviewCount !== fields.reviewCount;
    // eslint-disable-next-line no-await-in-loop
    await Product.updateOne({ _id: product._id }, { $set: fields });
    if (stale) corrected += 1;
  }
  if (corrected) logger.info(`Ratings: corrected ${corrected} product(s) to match their customer reviews`);
  return { checked: products.length, corrected };
};

module.exports = { refreshProductRating, syncAllProductRatings };
