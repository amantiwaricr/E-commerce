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
const { keyFor } = require('../utils/idempotency');
const esewaService = require('../services/esewa.service');
const { sendOrderConfirmation } = require('../services/notification.service');
const { buildInvoice, renderInvoicePdf } = require('../services/invoice.service');
const { statusCondition, summariseOrders } = require('../utils/orderQuery');
const integrityService = require('../services/integrity.service');
const User = require('../models/User');

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

/** The form fields an online order needs to reach eSewa, or null for COD. */
const paymentInstructionsFor = (order) =>
  order.payment?.transactionUuid
    ? esewaService.buildPaymentPayload({
        transactionUuid: order.payment.transactionUuid,
        amount: order.itemsTotal,
        deliveryCharge: order.deliveryCharge,
      })
    : undefined;

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
  const { paymentMethod, shippingAddress, deliveryMethod = 'standard' } = req.body;

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

  const priced = priceItems(entries, deliveryMethod);

  /*
   * Work out the idempotency key BEFORE any stock moves. A resubmitted
   * checkout must return the order it already placed, not reserve a second
   * lot of meat and then fail on the unique index.
   */
  const idempotencyKey = keyFor(req, {
    userId: req.user._id,
    items: priced.items,
    totalAmount: priced.totalAmount,
    paymentMethod,
    shippingAddress,
  });

  const existing = await Order.findOne({ idempotencyKey }).select('+idempotencyKey');
  if (existing) {
    logger.warn(`Duplicate checkout ignored for ${existing.orderNumber} (idempotency key matched)`);
    return res.status(200).json({
      success: true,
      duplicate: true,
      order: existing.toJSON(),
      payment: paymentInstructionsFor(existing),
    });
  }

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
      deliveryMethod,
      paymentStatus: 'unpaid',
      orderStatus: isOnline ? 'pending' : 'confirmed',
      shippingAddress,
      trackingInfo: {
        estimatedDelivery: deliveryMethod === 'pickup' ? 'Ready for pick-up in 2 hours' : env.store.deliveryEta,
        timeline,
      },
      placedAt: now,
      idempotencyKey,
    });

    if (isOnline) {
      order.payment.transactionUuid = `${order.orderNumber}-${crypto.randomBytes(4).toString('hex')}`;
      order.payment.provider = 'esewa';
    }

    // Opens the order's tamper-evident ledger. Written in the same save as the
    // order itself, so an order can never exist without its genesis entry.
    integrityService.appendEntry(order, {
      type: 'order.placed',
      data: integrityService.placementFacts(order),
      at: now,
    });

    await order.save();
  } catch (err) {
    await releaseStock(priced.items);
    throw err;
  }

  // The cart is emptied as soon as the order exists; an abandoned online payment
  // can be retried from the order itself.
  cart.items = [];
  await cart.save();

  // Remember where this went, so the next checkout is already filled in. A
  // failure here must not affect an order that has already been placed.
  try {
    if (req.user.rememberAddress(shippingAddress)) await req.user.save();
  } catch (err) {
    logger.warn(`Could not save the delivery address for ${req.user.email}: ${err.message}`);
  }

  const response = { success: true, order: order.toJSON() };

  if (isOnline) {
    response.payment = paymentInstructionsFor(order);
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
  const status = statusCondition(query.status);
  if (status) filter.orderStatus = status;

  const [orders, total, summary] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    summariseOrders(req.user._id),
  ]);

  return res.json({
    success: true,
    orders,
    summary,
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

/**
 * GET /api/orders/:orderNumber/invoice
 *
 * The customer's bill, as a PDF. Only for a delivered order: until then the
 * amounts can still change — a cancellation restocks it, a COD order is not
 * paid — and a bill that can change is not a bill.
 */
const downloadInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');

  const isOwner = order.user.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('This order belongs to another account');
  }

  if (order.orderStatus !== 'delivered') {
    throw ApiError.badRequest('The bill is available once the order has been delivered');
  }

  // The order stores only the customer's id, and the bill needs their name.
  const customer = isOwner ? req.user : await User.findById(order.user);

  const invoice = buildInvoice(order, customer);
  const pdf = await renderInvoicePdf(invoice);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  // A bill is per-customer and must never be held by a shared cache.
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(pdf);
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

  integrityService.appendEntry(order, {
    type: 'order.cancelled',
    data: {
      orderNumber: order.orderNumber,
      reason: order.cancelledReason,
      by: req.user._id,
      amountReleased: order.totalAmount,
      paymentStatusAtCancellation: order.paymentStatus,
    },
  });

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

/**
 * GET /api/orders/:orderNumber/integrity
 *
 * Re-verifies the order's ledger and reports what it found. The customer gets
 * the verdict and the receipt digest; an admin also gets the entries
 * themselves, which is what an auditor needs in order to check the chain
 * independently rather than take this endpoint's word for it.
 */
const verifyOrderIntegrity = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');

  const isOwner = order.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw ApiError.forbidden('This order belongs to another account');

  const report = integrityService.verifyLedger(order);

  return res.json({
    success: true,
    orderNumber: order.orderNumber,
    integrity: {
      valid: report.valid,
      signed: report.signed,
      entries: report.entries,
      receipt: report.tipHash,
      algorithm: `${integrityService.HASH_ALGORITHM} + ${integrityService.SIGNATURE_ALGORITHM}`,
      /* The specifics say what was changed and where. That is exactly what an
         attacker who already holds the database would like to know, so it goes
         to staff only; the customer is told whether their receipt stands. */
      problems: isAdmin ? report.problems : undefined,
      ledger: isAdmin ? order.ledger : undefined,
    },
  });
});

module.exports = {
  createOrder,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  retryPayment,
  downloadInvoice,
  verifyOrderIntegrity,
  reserveStock,
  releaseStock,
  ONLINE_METHODS,
};
