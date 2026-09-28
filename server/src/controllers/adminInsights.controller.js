'use strict';

/**
 * The admin panel's deeper pages: one customer, the stock room, the money
 * taken, and the store's own configuration.
 *
 * The arithmetic lives in utils/adminInsights.js; this file only fetches.
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { env } = require('../config/env');
const integrityService = require('../services/integrity.service');
const {
  VELOCITY_DAYS,
  paymentMethodCondition,
  paymentStatusCondition,
  stockStatus,
  daysOfCover,
  inventorySummary,
  customerSummary,
  ledgerVerdict,
  paymentSummary,
  settingsView,
} = require('../utils/adminInsights');

const DAY_MS = 24 * 60 * 60 * 1000;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── GET /api/admin/users/:id ────────────────────────────────────────────── */

/**
 * One customer: who they are, what they have spent, what they usually buy.
 *
 * The profile is picked field by field rather than spread from the document.
 * The sensitive fields are `select: false` today, but "today" is the wrong
 * thing for a page that shows a person's details to rest on.
 */
const getCustomer = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('Customer not found');

  const [rows, recent, favourites, usual] = await Promise.all([
    Order.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
          first: { $min: '$createdAt' },
          last: { $max: '$createdAt' },
        },
      },
    ]),
    Order.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber createdAt totalAmount orderStatus paymentStatus paymentMethod items.name items.quantity')
      .lean(),
    user.favourites?.length
      ? Product.find({ _id: { $in: user.favourites } }).select('name slug price unit images stock isAvailable').limit(12).lean()
      : [],
    // "What do they usually buy" — the question a butcher with regulars asks.
    Order.aggregate([
      { $match: { user: user._id, orderStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          units: { $sum: '$items.quantity' },
          orders: { $sum: 1 },
          spent: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
  ]);

  return res.json({
    success: true,
    customer: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatar: user.avatar || '',
      role: user.role,
      isBlocked: Boolean(user.isBlocked),
      isEmailVerified: Boolean(user.isEmailVerified),
      addresses: user.addresses || [],
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt || null,
    },
    summary: customerSummary(rows),
    recentOrders: recent.map((order) => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      items: (order.items || []).length,
      firstItem: order.items?.[0]?.name || '',
    })),
    usuallyBuys: usual.map((row) => ({ name: row._id, units: row.units, orders: row.orders, spent: row.spent })),
    favourites: favourites.map((product) => ({
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      price: product.price,
      unit: product.unit,
      image: product.images?.[0] || '',
      status: stockStatus(product),
    })),
  });
});

/* ── GET /api/admin/inventory ────────────────────────────────────────────── */

const INVENTORY_VIEWS = ['all', 'ok', 'low', 'out', 'hidden'];

/**
 * Every product with its stock, how fast it is selling, and how long what is
 * on the shelf will last at that rate.
 *
 * The whole catalogue is read at once — a butcher's counter runs to dozens or
 * hundreds of lines, not tens of thousands — so the summary and the status
 * tabs are computed over everything and always agree with each other.
 */
const getInventory = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const view = INVENTORY_VIEWS.includes(query.status) ? query.status : 'all';
  const category = Product.PRODUCT_CATEGORIES.includes(query.category) ? query.category : '';
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  const since = new Date(Date.now() - VELOCITY_DAYS * DAY_MS);
  const [products, sold] = await Promise.all([
    Product.find({})
      .select('name slug category price stock unit isAvailable images updatedAt')
      .sort({ stock: 1, name: 1 })
      .limit(1000)
      .lean(),
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, orderStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', units: { $sum: '$items.quantity' } } },
    ]),
  ]);

  const soldBy = new Map(sold.map((row) => [String(row._id), row.units]));
  const pattern = search ? new RegExp(escapeRegex(search), 'i') : null;

  const rows = products
    .map((product) => {
      const id = String(product._id);
      const units = soldBy.get(id) || 0;
      return {
        id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        price: product.price,
        unit: product.unit,
        stock: product.stock,
        image: product.images?.[0] || '',
        isAvailable: product.isAvailable,
        updatedAt: product.updatedAt,
        status: stockStatus(product),
        soldRecently: units,
        daysOfCover: daysOfCover(product.stock, units),
        stockValue: Math.round((Math.max(0, product.stock) || 0) * (product.price || 0) * 100) / 100,
      };
    })
    .filter((row) => (view === 'all' || row.status === view)
      && (!category || row.category === category)
      && (!pattern || pattern.test(row.name)));

  return res.json({
    success: true,
    summary: inventorySummary(products),
    velocityDays: VELOCITY_DAYS,
    categories: Product.PRODUCT_CATEGORIES,
    products: rows,
  });
});

/* ── GET /api/admin/payments ─────────────────────────────────────────────── */

/**
 * Every order seen as a payment, each with the verdict of its signed ledger.
 *
 * The verdict is recomputed here, not read from a stored flag: a stored
 * "verified" would be exactly as editable as the amounts it vouches for.
 */
const listPayments = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

  const filter = {};
  const method = paymentMethodCondition(query.method);
  const status = paymentStatusCondition(query.status);
  if (method) filter.paymentMethod = method;
  if (status) filter.paymentStatus = status;
  if (typeof query.search === 'string' && query.search.trim()) {
    const term = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ orderNumber: term }, { 'payment.referenceId': term }, { 'payment.transactionUuid': term }];
  }

  const [orders, total, rows] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('orderNumber user totalAmount paymentMethod paymentStatus orderStatus payment.referenceId payment.transactionUuid payment.paidAt createdAt ledger')
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
    Order.aggregate([
      {
        $group: {
          _id: {
            method: '$paymentMethod',
            status: '$paymentStatus',
            cancelled: { $eq: ['$orderStatus', 'cancelled'] },
          },
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
        },
      },
    ]),
  ]);

  return res.json({
    success: true,
    summary: paymentSummary(rows),
    payments: orders.map((order) => {
      const report = integrityService.verifyLedger(order);
      return {
        orderNumber: order.orderNumber,
        customer: order.user ? { id: String(order.user._id), name: order.user.name, email: order.user.email } : null,
        amount: order.totalAmount,
        method: order.paymentMethod,
        status: order.paymentStatus,
        orderStatus: order.orderStatus,
        reference: order.payment?.referenceId || '',
        paidAt: order.payment?.paidAt || null,
        createdAt: order.createdAt,
        // The ledger itself stays on the server; the page needs the verdict.
        ledger: { verdict: ledgerVerdict(report), entries: report.entries, receipt: report.tipHash },
      };
    }),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/* ── GET /api/admin/ledger/audit ─────────────────────────────────────────── */

/** How many broken orders to name. The count is always complete. */
const AUDIT_NAME_LIMIT = 50;

/**
 * Re-verifies every order's ledger and reports what it found.
 *
 * Streamed through a cursor, one order at a time, so an audit of a large
 * history never holds it all in memory. Ed25519 verification is cheap —
 * tens of microseconds an entry — so this is a click, not a job.
 */
const auditLedger = asyncHandler(async (req, res) => {
  const started = Date.now();
  const counts = { verified: 0, unsigned: 0, partial: 0, broken: 0, none: 0 };
  const broken = [];
  let checked = 0;

  const cursor = Order.find({}).select('orderNumber ledger createdAt').sort({ createdAt: -1 }).lean().cursor();
  for await (const order of cursor) {
    checked += 1;
    const verdict = ledgerVerdict(integrityService.verifyLedger(order));
    counts[verdict] += 1;
    if (verdict === 'broken' && broken.length < AUDIT_NAME_LIMIT) broken.push(order.orderNumber);
  }

  const keyring = integrityService.loadKeyring();
  return res.json({
    success: true,
    audit: {
      checked,
      counts,
      broken,
      brokenNamed: broken.length,
      signingConfigured: keyring.canSign,
      keyId: keyring.canSign ? keyring.keyId : '',
      durationMs: Date.now() - started,
      at: new Date(),
    },
  });
});

/* ── GET /api/admin/settings ─────────────────────────────────────────────── */

/**
 * The store's configuration, read-only and with every secret reduced to
 * whether it is set. Changing these means changing the environment and
 * restarting — a form here that pretended otherwise would be lying.
 */
const getSettings = asyncHandler(async (req, res) => {
  // eslint-disable-next-line global-require
  const { version } = require('../../package.json');
  return res.json({
    success: true,
    settings: settingsView(env, { nodeVersion: process.version, uptimeSeconds: process.uptime(), appVersion: version }),
  });
});

module.exports = { getCustomer, getInventory, listPayments, auditLedger, getSettings };
