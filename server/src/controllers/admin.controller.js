'use strict';

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { releaseStock } = require('./order.controller');
const { sendOrderStatusUpdate } = require('../services/notification.service');
const { toCsv } = require('../utils/csv');
const {
  REPORT_TIMEZONE,
  periodRange,
  growth,
  buildSalesSeries,
  buildChannels,
  buildTopProducts,
  buildOrderHeatmap,
} = require('../services/analytics.service');

const DAY_MS = 24 * 60 * 60 * 1000;
// The heat grid always reads over a fixed trailing quarter so switching the
// dashboard period cannot leave it with a handful of orders to colour.
const HEATMAP_DAYS = 90;

/** Shared by the order list and the CSV export so both honour the same filters. */
const buildOrderFilter = (query = {}) => {
  const filter = {};
  if (query.status) filter.orderStatus = query.status;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.orderNumber) filter.orderNumber = String(query.orderNumber).trim().toUpperCase();
  // An unparseable date is dropped rather than handed to Mongo as Invalid Date.
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) {
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  if (Object.keys(range).length) filter.createdAt = range;
  return filter;
};

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

/**
 * GET /api/admin/analytics — everything the dashboard charts read.
 *
 * `period` (daily|weekly|monthly|yearly) drives the rolling window used for the
 * channel split, best sellers and new-customer counts; each figure is paired
 * with the equivalent window immediately before it so the deltas are real.
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const { period, days, start, end, previousStart, previousEnd } = periodRange(query.period);
  const year = Number(query.year) || new Date().getFullYear();

  const live = { orderStatus: { $ne: 'cancelled' } };
  const between = (from, to) => ({ ...live, createdAt: { $gte: from, $lt: to } });
  // Widened so a Kathmandu-evening order at either edge of the year is still
  // grouped into the right month by the timezone-aware $month below.
  const yearStart = new Date(Date.UTC(year, 0, 1) - DAY_MS);
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1) + DAY_MS);
  const heatmapStart = new Date(end.getTime() - HEATMAP_DAYS * DAY_MS);

  const [
    yearRows,
    channelRows,
    previousChannelRows,
    topRows,
    heatRows,
    recentOrders,
    restocked,
    lowStock,
    newCustomers,
    previousCustomers,
    salesYears,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { ...live, createdAt: { $gte: yearStart, $lt: yearEnd } } },
      {
        $group: {
          _id: {
            year: { $year: { date: '$createdAt', timezone: REPORT_TIMEZONE } },
            month: { $month: { date: '$createdAt', timezone: REPORT_TIMEZONE } },
          },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: between(start, end) },
      {
        $group: {
          _id: '$paymentMethod',
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          units: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ]),
    Order.aggregate([
      { $match: between(previousStart, previousEnd) },
      { $group: { _id: '$paymentMethod', revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: between(start, end) },
      { $unwind: '$items' },
      {
        $group: {
          _id: { slug: '$items.slug', name: '$items.name', image: '$items.image', unit: '$items.unit' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 8 },
    ]),
    Order.aggregate([
      { $match: between(heatmapStart, end) },
      {
        $group: {
          _id: {
            day: { $dayOfWeek: { date: '$createdAt', timezone: REPORT_TIMEZONE } },
            hour: { $hour: { date: '$createdAt', timezone: REPORT_TIMEZONE } },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Order.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .select('orderNumber items totalAmount orderStatus paymentMethod createdAt')
      .lean(),
    Product.find({ stock: { $gt: 0 } })
      .sort({ updatedAt: -1 })
      .limit(6)
      .select('name slug images stock unit price updatedAt')
      .lean(),
    Product.find({ isAvailable: true, stock: { $lte: 5 } })
      .sort({ stock: 1 })
      .limit(6)
      .select('name slug images stock unit price')
      .lean(),
    User.countDocuments({ role: 'customer', createdAt: { $gte: start, $lt: end } }),
    User.countDocuments({ role: 'customer', createdAt: { $gte: previousStart, $lt: previousEnd } }),
    Order.aggregate([
      { $group: { _id: { $year: { date: '$createdAt', timezone: REPORT_TIMEZONE } } } },
      { $sort: { _id: -1 } },
    ]),
  ]);

  const sales = buildSalesSeries(
    yearRows.filter((row) => row._id.year === year).map((row) => ({ ...row, _id: row._id.month })),
    year
  );
  const channels = buildChannels(channelRows, previousChannelRows);
  const previousRevenue = previousChannelRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const previousOrders = previousChannelRows.reduce((sum, row) => sum + (row.orders || 0), 0);

  return res.json({
    success: true,
    analytics: {
      period,
      days,
      range: { start, end },
      sales: {
        ...sales,
        years: salesYears.map((row) => row._id).filter(Boolean),
        total: channels.totalRevenue,
        change: growth(channels.totalRevenue, previousRevenue),
        // What the store keeps once delivery is handed to the rider.
        net: sales.points.reduce((sum, point) => sum + point.revenue, 0),
      },
      channels: { ...channels, ordersChange: growth(channels.totalOrders, previousOrders) },
      topProducts: buildTopProducts(topRows),
      heatmap: { ...buildOrderHeatmap(heatRows), windowDays: HEATMAP_DAYS },
      customers: { total: newCustomers, change: growth(newCustomers, previousCustomers) },
      activity: {
        outgoing: recentOrders.map((order) => ({
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          paymentMethod: order.paymentMethod,
          at: order.createdAt,
          amount: order.totalAmount,
          item: order.items?.[0]
            ? {
                name: order.items[0].name,
                image: order.items[0].image,
                quantity: order.items[0].quantity,
                unit: order.items[0].unit,
              }
            : null,
          extraItems: Math.max(0, (order.items?.length || 0) - 1),
        })),
        incoming: restocked.map((product) => ({
          name: product.name,
          slug: product.slug,
          id: product._id,
          image: product.images?.[0] || '',
          stock: product.stock,
          unit: product.unit,
          price: product.price,
          at: product.updatedAt,
        })),
      },
      lowStock: lowStock.map((product) => ({
        id: product._id,
        name: product.name,
        image: product.images?.[0] || '',
        stock: product.stock,
        unit: product.unit,
        price: product.price,
      })),
    },
  });
});

/** GET /api/admin/orders/export — the current order filter as a CSV download. */
const exportOrders = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const orders = await Order.find(buildOrderFilter(query))
    .populate('user', 'name email phone')
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const csv = toCsv(orders, [
    { key: 'orderNumber', label: 'Order' },
    { key: 'placed', label: 'Placed at', value: (o) => new Date(o.createdAt).toISOString() },
    { key: 'customer', label: 'Customer', value: (o) => o.user?.name || o.shippingAddress?.recipientName || '' },
    { key: 'email', label: 'Email', value: (o) => o.user?.email || '' },
    { key: 'phone', label: 'Phone', value: (o) => o.shippingAddress?.phone || o.user?.phone || '' },
    { key: 'city', label: 'City', value: (o) => o.shippingAddress?.city || '' },
    { key: 'items', label: 'Items', value: (o) => (o.items || []).map((i) => `${i.quantity} x ${i.name}`).join(' | ') },
    { key: 'itemsTotal', label: 'Items total' },
    { key: 'deliveryCharge', label: 'Delivery' },
    { key: 'totalAmount', label: 'Total' },
    { key: 'paymentMethod', label: 'Payment method' },
    { key: 'paymentStatus', label: 'Payment status' },
    { key: 'orderStatus', label: 'Order status' },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${stamp}.csv"`);
  return res.send(csv);
});

/**
 * PATCH /api/admin/products/:id/stock — set stock outright or nudge it by a
 * delta, so a restock can be recorded without opening the full product form.
 */
const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const { stock, delta } = req.body;
  if (stock === undefined && delta === undefined) {
    throw ApiError.badRequest('Provide either a stock level or a delta');
  }

  const next = stock !== undefined ? Number(stock) : product.stock + Number(delta);
  if (!Number.isFinite(next) || next < 0) throw ApiError.badRequest('Stock cannot be negative');

  product.stock = next;
  await product.save();
  return res.json({ success: true, product: product.toJSON() });
});

/** GET /api/admin/orders — filterable list of every order. */
const listOrders = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const filter = buildOrderFilter(query);

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
  getAnalytics,
  exportOrders,
  adjustStock,
  buildOrderFilter,
  listOrders,
  getOrder,
  updateOrderStatus,
  updateTracking,
  listUsers,
  setUserBlocked,
};
