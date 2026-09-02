'use strict';

const { env } = require('../config/env');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const esewaService = require('../services/esewa.service');
const { sendOrderConfirmation } = require('../services/notification.service');
const { releaseStock } = require('./order.controller');
const User = require('../models/User');
const { round2 } = require('../utils/money');

const redirect = (res, path, params) => {
  const url = new URL(`${env.frontendUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return res.redirect(url.toString());
};

/**
 * Settles an eSewa transaction: verifies the signed callback, confirms the
 * transaction against eSewa's status API, and only then marks the order paid.
 * Idempotent — a replayed callback returns the already-paid order untouched.
 */
const settleEsewaPayment = async (encodedData) => {
  const decoded = esewaService.decodeCallbackData(encodedData);

  const order = await Order.findOne({ 'payment.transactionUuid': decoded.transaction_uuid });
  if (!order) throw ApiError.notFound('No order matches this payment');

  if (order.paymentStatus === 'paid') {
    return { order, alreadySettled: true };
  }

  // eSewa's status API — not the redirect payload — is what marks an order paid.
  const status = await esewaService.checkTransactionStatus({
    transactionUuid: decoded.transaction_uuid,
    totalAmount: order.totalAmount,
  });

  if (status.status !== 'COMPLETE') {
    order.paymentStatus = status.status === 'PENDING' ? 'unpaid' : 'failed';
    order.payment.rawStatusResponse = status.raw;
    await order.save();
    throw ApiError.badRequest(`Payment is not complete (eSewa reported "${status.status}")`);
  }

  // Guard against a tampered callback claiming a different amount.
  if (round2(status.totalAmount) !== round2(order.totalAmount)) {
    order.paymentStatus = 'failed';
    order.payment.rawStatusResponse = status.raw;
    await order.save();
    logger.error(
      `Amount mismatch for ${order.orderNumber}: eSewa ${status.totalAmount} vs order ${order.totalAmount}`
    );
    throw ApiError.badRequest('The paid amount does not match this order');
  }

  order.paymentStatus = 'paid';
  order.payment.referenceId = status.refId || decoded.transaction_code || '';
  order.payment.provider = 'esewa';
  order.payment.paidAt = new Date();
  order.payment.rawStatusResponse = status.raw;
  if (order.orderStatus === 'pending') {
    order.orderStatus = 'confirmed';
    order.pushTimeline('confirmed', `Payment received via eSewa (ref ${order.payment.referenceId})`);
  }
  await order.save();

  const user = await User.findById(order.user);
  sendOrderConfirmation(order, user).catch((err) =>
    logger.error('Order confirmation notification failed', err.message)
  );

  return { order, alreadySettled: false };
};

/**
 * GET /api/payments/esewa/success
 * Browser redirect target configured as eSewa's `success_url`.
 */
const esewaSuccess = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  // eSewa uses a GET redirect, but the POST form-post variant is accepted too.
  const data = query.data || req.body?.data;
  try {
    const { order } = await settleEsewaPayment(data);
    return redirect(res, `/orders/${order.orderNumber}`, { payment: 'success' });
  } catch (err) {
    logger.warn('eSewa success callback rejected:', err.message);
    return redirect(res, '/checkout/failed', { reason: err.message });
  }
});

/**
 * GET /api/payments/esewa/failure
 * Browser redirect target configured as eSewa's `failure_url`. Stock reserved
 * for the abandoned attempt is returned to the catalogue.
 */
const esewaFailure = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const data = query.data || req.body?.data;
  let orderNumber = '';

  try {
    // eSewa may or may not echo the signed payload on failure.
    const decoded = data ? esewaService.decodeCallbackData(data) : null;
    const uuid = decoded?.transaction_uuid || query.transaction_uuid || req.body?.transaction_uuid;
    if (uuid) {
      const order = await Order.findOne({ 'payment.transactionUuid': uuid });
      if (order && order.paymentStatus === 'unpaid') {
        orderNumber = order.orderNumber;
        order.paymentStatus = 'failed';
        order.orderStatus = 'cancelled';
        order.cancelledReason = 'Online payment was not completed';
        order.pushTimeline('cancelled', 'Payment failed or was cancelled at eSewa');
        await releaseStock(order.items);
        await order.save();
      }
    }
  } catch (err) {
    logger.warn('eSewa failure callback could not be matched to an order:', err.message);
  }

  return redirect(res, '/checkout/failed', { reason: 'Payment was cancelled or failed', order: orderNumber });
});

/**
 * POST /api/payments/esewa/verify
 * Lets the SPA settle a payment itself when it captures the callback client-side.
 */
const verifyEsewaPayment = asyncHandler(async (req, res) => {
  const { data } = req.body;
  if (!data) throw ApiError.badRequest('Missing eSewa payment data');
  const { order, alreadySettled } = await settleEsewaPayment(data);
  return res.json({ success: true, alreadySettled, order: order.toJSON() });
});

/** GET /api/payments/methods — payment options this deployment supports. */
const listPaymentMethods = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    methods: [
      { id: 'esewa', label: 'eSewa', enabled: true, description: 'Pay instantly with your eSewa wallet' },
      { id: 'cod', label: 'Cash on Delivery', enabled: true, description: 'Pay the rider when your order arrives' },
      {
        id: 'card',
        label: 'Debit / Credit card',
        enabled: env.esewa.cardEnabled,
        description: 'Processed securely through eSewa’s card gateway',
      },
    ],
    mode: env.esewa.mode,
  })
);

module.exports = { esewaSuccess, esewaFailure, verifyEsewaPayment, listPaymentMethods, settleEsewaPayment };
