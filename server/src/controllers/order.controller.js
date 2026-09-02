'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { generateOrderNumber } = require('../utils/orderNumber');
const { priceItems } = require('../services/pricing.service');
const esewaService = require('../services/esewa.service');
const { sendOrderConfirmation } = require('../services/notification.service');

/** Payment methods that are settled online through eSewa. */
const ONLINE_METHODS = new Set(['esewa', 'card']);

/**
 * Reserves stock for an order by decrementing each product conditionally.
 * Any line that cannot be satisfied rolls back the ones already decremented,
 * so an oversell can never be committed.
 */
const reserveStock = async (items) => {
  const applied = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const updated = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity }, isAvailable: true },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
    if (!updated) {
      // eslint-disable-next-line no-await-in-loop
      await releaseStock(applied);
      throw ApiError.badRequest(`${item.name} does not have enough stock left`);
    }
    applied.push(item);
  }
  return applied;
};

/** Returns reserved stock to the catalogue (cancellation, failed payment, rollback). */
const releaseStock = async (items) => {
  await Promise.all(
    items.map((item) => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }))
  );
};

/**
 * POST /api/orders
 * Creates an order from the signed-in user's cart. COD orders are confirmed
 * straight away; eSewa/card orders come back with a signed payment payload the
 * browser posts to eSewa.
 */
const createOrder = asyncHandler(async (req, res) => {
  const { paymentMethod, shippingAddress } = req.body;

  if (paymentMethod === 'card' && !env.esewa.cardEnabled) {
    throw ApiError.badRequest('Card payments are not enabled for this store yet. Please choose eSewa or COD.');
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');

  const entries = [];
  for (const line of cart.items) {
    const product = line.product;
    if (!product || !product.isAvailable) {
      throw ApiError.badRequest(`${product?.name || 'An item in your cart'} is no longer available`);
    }
    if (product.stock < line.quantity) {
      throw ApiError.badRequest(`Only ${product.stock} ${product.unit} of ${product.name} left in stock`);
    }
    entries.push({ product, quantity: line.quantity });
  }

  const priced = priceItems(entries);
  await reserveStock(priced.items);

  const isOnline = ONLINE_METHODS.has(paymentMethod);
  const now = new Date();

  // The order is built in its final creation state and written exactly ONCE.
  // Saving a freshly inserted document a second time re-sends the timeline
  // array's $push, which silently duplicates the first entry in the database
  // (the in-memory document still looks correct, so it is easy to miss).
  const timeline = [{ status: 'pending', note: 'Order placed', at: now, by: req.user._id }];
  if (!isOnline) {
    // Nothing to settle online, so a COD order is confirmed the moment it lands.
    timeline.push({ status: 'confirmed', note: 'Cash on delivery order confirmed', at: now });
  }

  let order;
  try {
    order = new Order({
      orderNumber: await generateOrderNumber(),
      user: req.user._id,
      items: priced.items,
      itemsTotal: priced.itemsTotal,
      deliveryCharge: priced.deliveryCharge,
      totalAmount: priced.totalAmount,
      paymentMethod,
      paymentStatus: 'unpaid',
      orderStatus: isOnline ? 'pending' : 'confirmed',
      shippingAddress,
      trackingInfo: { estimatedDelivery: env.store.deliveryEta, timeline },
      placedAt: now,
    });

    if (isOnline) {
      order.payment.transactionUuid = `${order.orderNumber}-${crypto.randomBytes(4).toString('hex')}`;
      order.payment.provider = 'esewa';
    }

    await order.save();
  } catch (err) {
    await releaseStock(priced.items);
    throw err;
  }

  // The cart is emptied as soon as the order exists; an abandoned online payment
  // can be retried from the order itself.
  cart.items = [];
  await cart.save();

  const response = { success: true, order: order.toJSON() };

  if (isOnline) {
    response.payment = esewaService.buildPaymentPayload({
      transactionUuid: order.payment.transactionUuid,
      amount: order.itemsTotal,
      deliveryCharge: order.deliveryCharge,
    });
  } else {
    sendOrderConfirmation(order, req.user).catch((err) =>
      logger.error('Order confirmation notification failed', err.message)
    );
  }

  return res.status(201).json(response);
});

/** GET /api/orders — the signed-in customer's order history. */
const listMyOrders = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));

  const filter = { user: req.user._id };
  if (query.status) filter.orderStatus = query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    orders,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/orders/:orderNumber — order detail + tracking timeline. */
const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('This order belongs to another account');
  }
  return res.json({ success: true, order: order.toJSON() });
});

/** POST /api/orders/:orderNumber/cancel — customers may cancel before dispatch. */
const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user.toString() !== req.user._id.toString()) throw ApiError.forbidden('This order belongs to another account');
  if (!order.canTransitionTo('cancelled')) {
    throw ApiError.badRequest(`An order that is already ${order.orderStatus} cannot be cancelled`);
  }
  if (['shipped', 'delivered'].includes(order.orderStatus)) {
    throw ApiError.badRequest('This order has already been dispatched. Please call support.');
  }

  await releaseStock(order.items);
  order.orderStatus = 'cancelled';
  order.cancelledReason = req.body.reason || 'Cancelled by customer';
  order.pushTimeline('cancelled', order.cancelledReason, req.user._id);
  await order.save();

  return res.json({ success: true, order: order.toJSON() });
});

/**
 * POST /api/orders/:orderNumber/pay — regenerates the eSewa payment payload for
 * an online order whose first payment attempt was abandoned.
 */
const retryPayment = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user.toString() !== req.user._id.toString()) throw ApiError.forbidden('This order belongs to another account');
  if (!ONLINE_METHODS.has(order.paymentMethod)) throw ApiError.badRequest('This order is not paid online');
  if (order.paymentStatus === 'paid') throw ApiError.badRequest('This order is already paid');
  if (order.orderStatus === 'cancelled') throw ApiError.badRequest('This order was cancelled');

  // A fresh transaction_uuid — eSewa rejects a re-used one from a failed attempt.
  order.payment.transactionUuid = `${order.orderNumber}-${crypto.randomBytes(4).toString('hex')}`;
  order.payment.provider = 'esewa';
  await order.save();

  return res.json({
    success: true,
    order: order.toJSON(),
    payment: esewaService.buildPaymentPayload({
      transactionUuid: order.payment.transactionUuid,
      amount: order.itemsTotal,
      deliveryCharge: order.deliveryCharge,
    }),
  });
});

module.exports = {
  createOrder,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  retryPayment,
  reserveStock,
  releaseStock,
  ONLINE_METHODS,
};
