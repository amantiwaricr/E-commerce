'use strict';

const mongoose = require('mongoose');

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'failed', 'refunded'];
const PAYMENT_METHODS = ['esewa', 'cod', 'card'];
const DELIVERY_METHODS = ['standard', 'pickup'];

/** Statuses an order may legally move to, keyed by its current status. */
const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Denormalised so historical orders survive product edits/deletions.
    name: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String, default: '' },
    unit: { type: String, default: 'kg' },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    street: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    district: { type: String, trim: true, maxlength: 80, default: '' },
    landmark: { type: String, trim: true, maxlength: 160, default: '' },
    notes: { type: String, trim: true, maxlength: 400, default: '' },
  },
  { _id: false }
);

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/**
 * One hash-chained, signed record of a money movement. Append-only: entries are
 * written once and never updated, which is what makes the chain meaningful.
 */
const ledgerEntrySchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, min: 0 },
    type: { type: String, required: true },
    at: { type: Date, required: true },
    // The facts this entry commits to. Mixed because each event type records
    // different ones; whatever is here is exactly what was hashed.
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    prevHash: { type: String, default: '' },
    hash: { type: String, required: true },
    alg: { type: String, default: '' },
    keyId: { type: String, default: '' },
    signature: { type: String, default: '' },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    // eSewa's `transaction_uuid` — our idempotency key for the payment attempt.
    transactionUuid: { type: String, index: true, sparse: true },
    // eSewa's own reference returned on a successful transaction.
    referenceId: { type: String, default: '' },
    provider: { type: String, default: '' },
    paidAt: { type: Date },
    rawStatusResponse: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(val) => val.length > 0, 'An order must contain at least one item'],
    },
    itemsTotal: { type: Number, required: true, min: 0 },
    deliveryCharge: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    // Pick-up orders are collected in store and carry no delivery charge.
    deliveryMethod: { type: String, enum: DELIVERY_METHODS, default: 'standard' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid', index: true },
    payment: { type: paymentSchema, default: () => ({}) },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    trackingInfo: {
      carrier: { type: String, trim: true, default: '' },
      trackingCode: { type: String, trim: true, default: '' },
      estimatedDelivery: { type: String, trim: true, default: '' },
      timeline: { type: [trackingEventSchema], default: [] },
    },
    notifications: {
      emailSentAt: { type: Date },
      whatsappSentAt: { type: Date },
      lastError: { type: String, default: '' },
    },
    /* Guards against a double-submitted checkout becoming two orders. Unique
       and sparse: older orders have no key and must not collide on `null`. */
    idempotencyKey: { type: String, index: { unique: true, sparse: true }, select: false },
    cancelledReason: { type: String, trim: true, maxlength: 400, default: '' },
    /* Tamper-evident history of this order's money movements. See
       services/integrity.service.js for what each entry commits to. */
    ledger: { type: [ledgerEntrySchema], default: [] },
    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, paymentStatus: 1 });

orderSchema.methods.canTransitionTo = function canTransitionTo(nextStatus) {
  return (ORDER_STATUS_TRANSITIONS[this.orderStatus] || []).includes(nextStatus);
};

orderSchema.methods.pushTimeline = function pushTimeline(status, note = '', by = undefined) {
  this.trackingInfo.timeline.push({ status, note, at: new Date(), by });
  return this;
};

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.DELIVERY_METHODS = DELIVERY_METHODS;
module.exports.ORDER_STATUS_TRANSITIONS = ORDER_STATUS_TRANSITIONS;
