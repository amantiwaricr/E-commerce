'use strict';

const MONGO_OPERATOR = /^\$/;

/**
 * Recursively strips keys that MongoDB would interpret as operators (`$gt`,
 * `$where`, …) and keys containing dots. Mutates a copy, never the original.
 */
const sanitizeValue = (value, depth = 0) => {
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));

  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (MONGO_OPERATOR.test(key) || key.includes('.')) continue;
    clean[key] = sanitizeValue(val, depth + 1);
  }
  return clean;
};

module.exports = { sanitizeValue };
