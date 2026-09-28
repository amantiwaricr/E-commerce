'use strict';

/**
 * Product ratings and reviews.
 *
 * A customer may rate a product once they have received it: a delivered order
 * containing it is the gate. Rating again edits their existing review, so
 * each customer counts once. The product's average and count are recomputed
 * from the visible reviews on every change (services/rating.service.js).
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { refreshProductRating } = require('../services/rating.service');
const { REVIEW_SORTS, summariseRatings, publicReview, eligibility } = require('../utils/reviews');

const PAGE_LIMIT = 20;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pageOf = (query, max = PAGE_LIMIT) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(max, Math.max(1, Number(query.limit) || 10));
  return { page, limit };
};

/** Whole stars 1–5 from the query string, or null. */
const starsParam = (value) => {
  const stars = Number(value);
  return typeof value === 'string' && Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
};

const findListedProduct = async (slug) => {
  const product = await Product.findOne({ slug: String(slug) }).select('_id name slug isAvailable').lean();
  if (!product || !product.isAvailable) throw ApiError.notFound('Product not found');
  return product;
};

/** The customer's most recent delivered order containing the product, if any. */
const deliveredOrderFor = async (userId, productId) => {
  const order = await Order.findOne({ user: userId, orderStatus: 'delivered', 'items.product': productId })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  return order ? order._id : null;
};

const ownReview = (review) =>
  review
    ? {
      id: String(review._id),
      rating: review.rating,
      comment: review.comment || '',
      isHidden: Boolean(review.isHidden),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    }
    : null;

/* ── Storefront ──────────────────────────────────────────────────────────── */

/** GET /api/products/:slug/reviews — the summary and a page of reviews. */
const listProductReviews = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const product = await findListedProduct(req.params.slug);
  const { page, limit } = pageOf(query);
  const sortKey = Object.hasOwn(REVIEW_SORTS, query.sort) ? query.sort : 'newest';
  const stars = starsParam(query.stars);

  const visible = { product: product._id, isHidden: false };
  const filter = stars ? { ...visible, rating: stars } : visible;

  const [rows, reviews, total] = await Promise.all([
    Review.aggregate([{ $match: visible }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
    Review.find(filter)
      .sort(REVIEW_SORTS[sortKey])
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name')
      .lean(),
    Review.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    summary: summariseRatings(rows),
    reviews: reviews.map(publicReview),
    sort: sortKey,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/products/:slug/reviews/mine — may I rate this, and what did I say? */
const getMyReview = asyncHandler(async (req, res) => {
  const product = await findListedProduct(req.params.slug);
  const [orderId, review] = await Promise.all([
    deliveredOrderFor(req.user._id, product._id),
    Review.findOne({ product: product._id, user: req.user._id }).lean(),
  ]);
  const verdict = eligibility({ user: req.user, deliveredOrderId: orderId });
  return res.json({ success: true, ...verdict, review: ownReview(review) });
});

/** PUT /api/products/:slug/reviews/mine — rate, or change an earlier rating. */
const saveMyReview = asyncHandler(async (req, res) => {
  const product = await findListedProduct(req.params.slug);
  const orderId = await deliveredOrderFor(req.user._id, product._id);
  const verdict = eligibility({ user: req.user, deliveredOrderId: orderId });
  if (!verdict.eligible) {
    throw ApiError.forbidden(
      verdict.reason === 'admin'
        ? 'Store accounts cannot rate products'
        : 'You can rate this product once an order containing it has been delivered'
    );
  }

  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

  // One review per customer per product. The unique index settles a race
  // between two submissions; the loser becomes an edit of the winner.
  const update = { $set: { rating, comment, order: orderId } };
  const filter = { product: product._id, user: req.user._id };
  let review;
  let created = false;
  try {
    const existing = await Review.exists(filter);
    created = !existing;
    review = await Review.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }).lean();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    created = false;
    review = await Review.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean();
  }

  const summary = await refreshProductRating(product._id);
  return res.status(created ? 201 : 200).json({ success: true, created, review: ownReview(review), summary });
});

/** DELETE /api/products/:slug/reviews/mine */
const deleteMyReview = asyncHandler(async (req, res) => {
  const product = await findListedProduct(req.params.slug);
  const removed = await Review.findOneAndDelete({ product: product._id, user: req.user._id });
  if (!removed) throw ApiError.notFound('You have not rated this product');
  const summary = await refreshProductRating(product._id);
  return res.json({ success: true, summary });
});

/* ── Admin ───────────────────────────────────────────────────────────────── */

const REVIEW_STATUSES = ['visible', 'hidden'];

/** GET /api/admin/reviews — every review, newest first, for moderation. */
const adminListReviews = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const { page, limit } = pageOf(query, 50);
  const filter = {};
  const stars = starsParam(query.stars);
  if (stars) filter.rating = stars;
  if (REVIEW_STATUSES.includes(query.status)) filter.isHidden = query.status === 'hidden';

  if (typeof query.search === 'string' && query.search.trim()) {
    const term = new RegExp(escapeRegex(query.search.trim()), 'i');
    const [products, users] = await Promise.all([
      Product.find({ name: term }).select('_id').limit(200).lean(),
      User.find({ $or: [{ name: term }, { email: term }] }).select('_id').limit(200).lean(),
    ]);
    filter.$or = [
      { comment: term },
      { product: { $in: products.map((p) => p._id) } },
      { user: { $in: users.map((u) => u._id) } },
    ];
  }
  if (typeof query.product === 'string' && /^[a-f0-9]{24}$/i.test(query.product)) filter.product = query.product;

  const [reviews, total, rows, hidden] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .populate('product', 'name slug images')
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: { isHidden: false } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
    Review.countDocuments({ isHidden: true }),
  ]);

  return res.json({
    success: true,
    summary: { ...summariseRatings(rows), hidden },
    reviews: reviews.map((review) => ({
      id: String(review._id),
      rating: review.rating,
      comment: review.comment || '',
      isHidden: Boolean(review.isHidden),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      product: review.product
        ? { id: String(review.product._id), name: review.product.name, slug: review.product.slug, image: review.product.images?.[0] || '' }
        : null,
      customer: review.user ? { id: String(review.user._id), name: review.user.name, email: review.user.email } : null,
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** PATCH /api/admin/reviews/:id — hide an abusive review, or show it again. */
const adminSetReviewHidden = asyncHandler(async (req, res) => {
  const hide = req.body.isHidden === true;
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    hide ? { $set: { isHidden: true, hiddenAt: new Date(), hiddenBy: req.user._id } } : { $set: { isHidden: false }, $unset: { hiddenAt: 1, hiddenBy: 1 } },
    { new: true }
  ).lean();
  if (!review) throw ApiError.notFound('Review not found');
  const summary = await refreshProductRating(review.product);
  return res.json({ success: true, review: { id: String(review._id), isHidden: review.isHidden }, summary });
});

module.exports = {
  listProductReviews,
  getMyReview,
  saveMyReview,
  deleteMyReview,
  adminListReviews,
  adminSetReviewHidden,
};
