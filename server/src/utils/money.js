'use strict';

/** Rounds to 2 decimals — NPR amounts are sent to eSewa as fixed-precision numbers. */
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Formats an amount for display/notifications, e.g. `Rs. 1,250.00`. */
const formatNpr = (value) =>
  `Rs. ${round2(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = { round2, formatNpr };
