'use strict';

const Counter = require('../models/Counter');

/**
 * Builds a human-friendly, collision-free order number: FMN-<YYMM>-<seq>.
 * The sequence is drawn from an atomic per-month counter document.
 */
const generateOrderNumber = async () => {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `order:${yy}${mm}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `FMN-${yy}${mm}-${String(counter.seq).padStart(5, '0')}`;
};

module.exports = { generateOrderNumber };
