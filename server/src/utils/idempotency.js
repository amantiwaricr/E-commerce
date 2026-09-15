'use strict';

const crypto = require('crypto');

/**
 * A double-submitted checkout — an impatient second click, a retried request
 * after a timeout, a flaky mobile connection — would otherwise place two
 * orders and reserve the stock twice.
 *
 * The client may send its own `Idempotency-Key`. When it does not, one is
 * derived from what the order actually is: the same customer, the same basket,
 * the same total, the same address, within the same short window. Two requests
 * that agree on all of that are the same intent, not two orders.
 */

/** How long two identical submissions are treated as one. */
const WINDOW_MS = 2 * 60 * 1000;

const HEADER = 'idempotency-key';

/** Keys are echoed into an index, so the shape is constrained. */
const isValidClientKey = (key) => typeof key === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(key);

/**
 * Derives a key from the order's own content. `now` is floored to the window
 * so two clicks a second apart land on the same key.
 */
const deriveKey = ({ userId, items = [], totalAmount, paymentMethod, shippingAddress = {}, now = Date.now() }) => {
  const basket = items
    .map((item) => `${item.product}:${item.quantity}`)
    .sort()
    .join('|');
  const where = [shippingAddress.street, shippingAddress.city, shippingAddress.phone]
    .map((part) => String(part || '').trim().toLowerCase())
    .join('|');

  const material = [
    String(userId),
    basket,
    String(totalAmount),
    String(paymentMethod),
    where,
    String(Math.floor(now / WINDOW_MS)),
  ].join('~');

  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
};

/**
 * The key for this request: the client's if it sent a usable one, otherwise
 * one derived from the order itself.
 */
const keyFor = (req, order) => {
  const supplied = req?.get?.(HEADER) || req?.headers?.[HEADER];
  if (isValidClientKey(supplied)) return `c_${supplied}`;
  return `d_${deriveKey(order)}`;
};

module.exports = { keyFor, deriveKey, isValidClientKey, WINDOW_MS, HEADER };
