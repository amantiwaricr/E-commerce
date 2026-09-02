'use strict';

const { sanitizeValue } = require('../utils/sanitize');

/**
 * Removes MongoDB operator keys from user-controlled input before it can reach
 * a query. `req.query` is read-only on some Express versions, so its sanitised
 * copy is exposed as `req.safeQuery` and assigned back when writable.
 */
const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
  if (req.params && typeof req.params === 'object') req.params = sanitizeValue(req.params);

  const cleanQuery = sanitizeValue({ ...(req.query || {}) });
  req.safeQuery = cleanQuery;
  try {
    req.query = cleanQuery;
  } catch (err) {
    // Express 5 exposes req.query via a getter — req.safeQuery is the fallback.
  }
  return next();
};

module.exports = sanitizeRequest;
