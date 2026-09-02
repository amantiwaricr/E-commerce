'use strict';

const { env } = require('../config/env');
const { round2 } = require('../utils/money');

/** Delivery is free once the basket crosses the configured threshold. */
const deliveryChargeFor = (itemsTotal) =>
  itemsTotal > 0 && itemsTotal < env.store.freeDeliveryThreshold ? round2(env.store.deliveryCharge) : 0;

/**
 * Prices a set of `{ product, quantity }` pairs against live product documents.
 * Prices always come from the database, never from the client.
 */
const priceItems = (entries) => {
  const items = entries.map(({ product, quantity }) => ({
    product: product._id,
    name: product.name,
    slug: product.slug,
    image: product.images?.[0] || '',
    unit: product.unit,
    price: round2(product.price),
    quantity,
    subtotal: round2(product.price * quantity),
  }));

  const itemsTotal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  const deliveryCharge = deliveryChargeFor(itemsTotal);

  return { items, itemsTotal, deliveryCharge, totalAmount: round2(itemsTotal + deliveryCharge) };
};

module.exports = { priceItems, deliveryChargeFor };
