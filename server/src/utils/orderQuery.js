'use strict';

const Order = require('../models/Order');

/** An order still on its way — the grouping the customer's "Active" tab means. */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'processing', 'shipped'];

/**
 * Turns a `?status=` value into a Mongo condition, or null for "no filter".
 *
 * Whitelisted rather than passed through: Express parses `?status[$ne]=x` into
 * an object, and handing that straight to the query would let a caller inject
 * an operator. The blast radius is small — the filter is already pinned to the
 * caller's own orders — but a query operator arriving from the URL is never
 * something to leave working.
 */
const statusCondition = (value) => {
  if (typeof value !== 'string' || !value) return null;
  if (value === 'active') return { $in: ACTIVE_STATUSES };
  return Order.ORDER_STATUSES.includes(value) ? value : null;
};

/**
 * Shapes the `$group` rows of the summary aggregate into what the page shows.
 *
 * Kept apart from the query so the arithmetic — which grouping counts as
 * active, what counts as spent — can be tested without a database.
 */
const summaryFromRows = (rows = []) => {
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return {
    byStatus,
    total,
    active: ACTIVE_STATUSES.reduce((sum, status) => sum + (byStatus[status] || 0), 0),
    delivered: byStatus.delivered || 0,
    cancelled: byStatus.cancelled || 0,
    // A cancelled order was never paid for, so counting it as spend would be a lie.
    spent: rows.filter((row) => row._id !== 'cancelled').reduce((sum, row) => sum + row.amount, 0),
  };
};

/**
 * How many orders sit in each status, and what has been spent.
 *
 * Counted in the database rather than derived from the page being returned:
 * the page holds ten orders, so anything worked out from it would be wrong as
 * soon as there were eleven.
 */
const summariseOrders = async (userId) => {
  const rows = await Order.aggregate([
    { $match: { user: userId } },
    { $group: { _id: '$orderStatus', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
  ]);
  return summaryFromRows(rows);
};

module.exports = { ACTIVE_STATUSES, statusCondition, summaryFromRows, summariseOrders };
