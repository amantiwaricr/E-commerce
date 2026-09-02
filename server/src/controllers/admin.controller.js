'use strict';

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { releaseStock } = require('./order.controller');
const { sendOrderStatusUpdate } = require('../services/notification.service');

/** GET /api/admin/stats — headline numbers for the admin dashboard. */
const getDashboardStats = asyncHandler(async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayOrders, todayRevenue, pendingOrders, totalOrders, lifetimeRevenue, customers, lowStock, statusBreakdown] =
    await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfToday }, orderStatus: { $ne: 'cancelled' } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfToday }, orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.countDocuments({ orderStatus: { $in: ['pending', 'confirmed', 'processing'] } }),
      Order.countDocuments({}),
      Order.aggregate([
        { $match: { orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments({ stock: { $lte: 5 }, isAvailable: true }),
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    ]);

  return res.json({
    success: true,
    stats: {
      todayOrders,
      todayRevenue: todayRevenue[0]?.total || 0,
      pendingOrders,
      totalOrders,
      lifetimeRevenue: lifetimeRevenue[0]?.total || 0,
      customers,
      lowStockProducts: lowStock,
      ordersByStatus: statusBreakdown.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {}),
    },
  });
});

/** GET /api/admin/orders — filterable list of every order. */
const listOrders = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const filter = {};
  if (query.status) filter.orderStatus = query.status;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.orderNumber) filter.orderNumber = String(query.orderNumber).trim().toUpperCase();
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    orders,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/admin/orders/:orderNumber */
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber }).populate('user', 'name email phone');
  if (!order) throw ApiError.notFound('Order not found');
  return res.json({ success: true, order });
});

/**
 * PATCH /api/admin/orders/:orderNumber/status
 * Advances an order through the allowed status transitions, appends a tracking
 * timeline entry, and notifies the customer.
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note = '' } = req.body;
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');

  if (order.orderStatus === status) throw ApiError.badRequest(`Order is already ${status}`);
  if (!order.canTransitionTo(status)) {
    throw ApiError.badRequest(`An order that is ${order.orderStatus} cannot become ${status}`);
  }

  if (status === 'cancelled') {
    await releaseStock(order.items);
    order.cancelledReason = note || 'Cancelled by store';
  }
  if (status === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus === 'unpaid') {
    // Cash was collected on handover.
    order.paymentStatus = 'paid';
    order.payment.paidAt = new Date();
    order.payment.provider = 'cod';
  }

  order.orderStatus = status;
  order.pushTimeline(status, note, req.user._id);
  await order.save();

  const customer = await User.findById(order.user);
  sendOrderStatusUpdate(order, customer, note).catch((err) =>
    logger.error('Order status notification failed', err.message)
  );

  return res.json({ success: true, order: order.toJSON() });
});

/** PATCH /api/admin/orders/:orderNumber/tracking — carrier, code, ETA, free note. */
const updateTracking = asyncHandler(async (req, res) => {
  const { carrier, trackingCode, estimatedDelivery, note } = req.body;
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');

  if (carrier !== undefined) order.trackingInfo.carrier = carrier;
  if (trackingCode !== undefined) order.trackingInfo.trackingCode = trackingCode;
  if (estimatedDelivery !== undefined) order.trackingInfo.estimatedDelivery = estimatedDelivery;
  if (note) order.pushTimeline(order.orderStatus, note, req.user._id);

  await order.save();
  return res.json({ success: true, order: order.toJSON() });
});

/** GET /api/admin/users */
const listUsers = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.search) {
    const term = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: new RegExp(term, 'i') }, { email: new RegExp(term, 'i') }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    users,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** PATCH /api/admin/users/:id/block — blocks or unblocks a customer. */
const setUserBlocked = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user._id.toString() === req.user._id.toString()) throw ApiError.badRequest('You cannot block your own account');
  if (user.role === 'admin') throw ApiError.badRequest('Admin accounts cannot be blocked');

  user.isBlocked = req.body.isBlocked !== undefined ? Boolean(req.body.isBlocked) : !user.isBlocked;
  await user.save();
  return res.json({ success: true, user: user.toPublicJSON() });
});

module.exports = {
  getDashboardStats,
  listOrders,
  getOrder,
  updateOrderStatus,
  updateTracking,
  listUsers,
  setUserBlocked,
};
