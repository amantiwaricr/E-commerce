'use strict';

/**
 * Pure helpers for product ratings. No database access here, so the
 * arithmetic is tested directly.
 */

/** How many of the latest ratings a product carries for the storefront tile. */
const RECENT_RATINGS = 3;

const REVIEW_SORTS = {
  newest: { createdAt: -1, _id: -1 },
  highest: { rating: -1, createdAt: -1, _id: -1 },
  lowest: { rating: 1, createdAt: -1, _id: -1 },
};

/** One decimal place, the way a rating is shown everywhere. */
const roundRating = (value) => Math.round((Number(value) || 0) * 10) / 10;

/**
 * @param rows `$group` output keyed by star count: `[{ _id: 5, count: 12 }, …]`
 * @returns `{ average, count, distribution: { 1: n, …, 5: n } }`
 */
const summariseRatings = (rows = []) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  rows.forEach(({ _id, count: n = 0 }) => {
    const stars = Number(_id);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5 || n <= 0) return;
    distribution[stars] += n;
    count += n;
    total += stars * n;
  });
  return { average: count ? roundRating(total / count) : 0, count, distribution };
};

/**
 * How a reviewer is named in public: "Sita S.". A full surname, an email or a
 * phone number never leaves the server with a review.
 */
const publicName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  // An email typed into the name field is not a name to show.
  if (!parts.length || parts[0].includes('@')) return 'Customer';
  const first = parts[0].slice(0, 30);
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : '';
  return `${first}${last}`;
};

/** The single letter shown in a reviewer's avatar. */
const initialOf = (name) => publicName(name).charAt(0).toUpperCase();

/** A review as the storefront sees it. */
const publicReview = (review) => ({
  id: String(review._id),
  rating: review.rating,
  comment: review.comment || '',
  author: publicName(review.user?.name),
  createdAt: review.createdAt,
  edited: Boolean(review.updatedAt && review.createdAt
    && new Date(review.updatedAt).getTime() - new Date(review.createdAt).getTime() > 60 * 1000),
});

/**
 * Whether a customer may rate a product, and why not when they may not.
 * `deliveredOrderId` is the id of a delivered order of theirs that contains
 * the product, or null.
 */
const eligibility = ({ user, deliveredOrderId }) => {
  if (!user) return { eligible: false, reason: 'signin' };
  if (user.role === 'admin') return { eligible: false, reason: 'admin' };
  if (!deliveredOrderId) return { eligible: false, reason: 'not-delivered' };
  return { eligible: true, reason: '' };
};

module.exports = {
  RECENT_RATINGS,
  REVIEW_SORTS,
  roundRating,
  summariseRatings,
  publicName,
  initialOf,
  publicReview,
  eligibility,
};
