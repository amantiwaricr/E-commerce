'use strict';

/**
 * The arithmetic behind the admin panel's inventory, customer, payments and
 * settings pages — kept apart from the queries so it can be tested without a
 * database, and so the dashboard and the new pages cannot disagree about what
 * "low stock" or "spent" means.
 */

const Order = require('../models/Order');

/** At or below this many units a product needs restocking. One definition. */
const LOW_STOCK_THRESHOLD = 5;

/** The window stock velocity is measured over. */
const VELOCITY_DAYS = 30;

/* ── query hardening ─────────────────────────────────────────────────────── */

/**
 * Accepts a query-string value only if it is one of a known set.
 *
 * Express parses `?role[$ne]=admin` into an object, and passing that to a
 * Mongo filter runs it as an operator. These routes are admin-only, so the
 * blast radius is small, but an operator arriving from a URL is never worth
 * leaving working — the storefront's order filter was hardened the same way.
 */
const oneOf = (allowed) => (value) => (typeof value === 'string' && allowed.includes(value) ? value : null);

const roleCondition = oneOf(['customer', 'admin']);
const orderStatusCondition = oneOf(Order.ORDER_STATUSES);
const paymentMethodCondition = oneOf(Order.PAYMENT_METHODS);
const paymentStatusCondition = oneOf(Order.PAYMENT_STATUSES);

/* ── inventory ───────────────────────────────────────────────────────────── */

/**
 * `hidden` outranks the stock level: a delisted product with zero units is not
 * a restocking problem, it is a product nobody can buy on purpose.
 */
const stockStatus = (product) => {
  if (!product || product.isAvailable === false) return 'hidden';
  const stock = Number(product.stock) || 0;
  if (stock <= 0) return 'out';
  if (stock <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
};

/**
 * How many days the current stock lasts at the recent rate of sale.
 *
 * `null` when nothing sold in the window — "infinite" would be true and
 * useless, and a product nobody buys is a different conversation from one
 * about to run out.
 */
const daysOfCover = (stock, soldInWindow, windowDays = VELOCITY_DAYS) => {
  const sold = Number(soldInWindow) || 0;
  if (sold <= 0) return null;
  const perDay = sold / windowDays;
  return Math.round(((Number(stock) || 0) / perDay) * 10) / 10;
};

const inventorySummary = (products = []) => {
  const byCategory = new Map();
  const summary = { skus: 0, unitsInStock: 0, stockValue: 0, out: 0, low: 0, hidden: 0, ok: 0 };

  products.forEach((product) => {
    const status = stockStatus(product);
    const stock = Math.max(0, Number(product.stock) || 0);
    const value = stock * (Number(product.price) || 0);

    summary.skus += 1;
    summary[status] += 1;
    // Stock held for a delisted product is still money on the shelf, so it
    // counts toward value — but not toward what customers can buy.
    summary.stockValue += value;
    if (status !== 'hidden') summary.unitsInStock += stock;

    const name = product.category || 'Uncategorised';
    const row = byCategory.get(name) || { name, skus: 0, units: 0, value: 0 };
    row.skus += 1;
    row.units += stock;
    row.value += value;
    byCategory.set(name, row);
  });

  summary.stockValue = Math.round(summary.stockValue * 100) / 100;
  summary.byCategory = [...byCategory.values()].sort((a, b) => b.value - a.value);
  return summary;
};

/* ── customers ───────────────────────────────────────────────────────────── */

/**
 * @param rows `$group` output by orderStatus: `{ _id, count, amount, first, last }`
 */
const customerSummary = (rows = []) => {
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const kept = rows.filter((row) => row._id !== 'cancelled');
  const keptCount = kept.reduce((sum, row) => sum + row.count, 0);
  // A cancelled order was never paid for; counting it would inflate both the
  // lifetime spend and the average basket.
  const spent = kept.reduce((sum, row) => sum + (row.amount || 0), 0);

  const dates = (key) => rows.map((row) => row[key]).filter(Boolean).map((d) => new Date(d).getTime());

  return {
    orders: rows.reduce((sum, row) => sum + row.count, 0),
    spent: Math.round(spent * 100) / 100,
    averageOrder: keptCount ? Math.round((spent / keptCount) * 100) / 100 : 0,
    cancelled: byStatus.cancelled || 0,
    delivered: byStatus.delivered || 0,
    firstOrderAt: dates('first').length ? new Date(Math.min(...dates('first'))) : null,
    lastOrderAt: dates('last').length ? new Date(Math.max(...dates('last'))) : null,
    byStatus,
  };
};

/* ── payments ────────────────────────────────────────────────────────────── */

/** The four outcomes the storefront's integrity badge renders, plus "no ledger". */
const ledgerVerdict = (report) => {
  if (!report || !report.entries) return 'none';
  if (report.valid) return 'verified';
  if (!report.intact) return 'broken';
  return report.signingConfigured ? 'partial' : 'unsigned';
};

/**
 * @param rows `$group` output keyed by `{ method, status, cancelled }` with a
 *             count and amount.
 */
const paymentSummary = (rows = []) => {
  const empty = () => ({ count: 0, amount: 0 });
  const summary = { collected: empty(), outstanding: empty(), failed: empty(), refunded: empty(), byMethod: {} };

  rows.forEach(({ _id = {}, count = 0, amount = 0 }) => {
    const bucket = { paid: 'collected', unpaid: 'outstanding', failed: 'failed', refunded: 'refunded' }[_id.status];
    // A cancelled order that was never paid is not money owed — counting it
    // would have the shop chasing cash for meat that never left the counter.
    if (bucket === 'outstanding' && _id.cancelled) return;
    if (bucket) {
      summary[bucket].count += count;
      summary[bucket].amount += amount;
    }
    if (_id.status === 'paid') {
      const method = summary.byMethod[_id.method] || empty();
      method.count += count;
      method.amount += amount;
      summary.byMethod[_id.method] = method;
    }
  });

  ['collected', 'outstanding', 'failed', 'refunded'].forEach((key) => {
    summary[key].amount = Math.round(summary[key].amount * 100) / 100;
  });
  return summary;
};

/* ── settings ────────────────────────────────────────────────────────────── */

/**
 * `mongodb+srv://user:pass@host/db` → `host`. Credentials never leave.
 *
 * Not `new URL()`: it rejects a replica-set string (`a:27017,b:27017`), which
 * left the field blank. And not a regex for "the part before @" either — a
 * password with an unencoded `/` or `@` in it would cut that short and show
 * half the password. Everything up to the LAST `@` is discarded instead, so a
 * credential cannot survive however badly the string is formed.
 */
const databaseHost = (uri) => {
  const raw = String(uri || '');
  const scheme = /^mongodb(?:\+srv)?:\/\//i.exec(raw);
  if (!scheme) return '';
  const rest = raw.slice(scheme[0].length).split('?')[0];
  const afterCredentials = rest.slice(rest.lastIndexOf('@') + 1);
  return afterCredentials.split('/')[0].split(',')[0];
};

/** eSewa's published test secret. Seeing it in production means no real money. */
const ESEWA_TEST_SECRET = '8gBm/:&EnhH.1/q';

/**
 * What the store's configuration is, in a form safe to send to a browser.
 *
 * Built from an explicit allowlist, never by copying `env` and deleting the
 * secrets: a field added to `env` next year must not appear here by default.
 * Every secret is reduced to "is it set" — the test suite checks that no
 * secret value survives into the output.
 */
const settingsView = (env, { nodeVersion = process.version, uptimeSeconds = 0, appVersion = '' } = {}) => {
  const signing = env.txnSigning || {};
  const mail = env.mail || {};
  const whatsapp = env.whatsapp || {};
  const esewa = env.esewa || {};
  const https = env.https || {};
  const cookie = env.cookie || {};
  const store = env.store || {};

  return {
    store: {
      name: store.name || '',
      address: store.address || '',
      supportPhone: store.supportPhone || '',
      supportEmail: store.supportEmail || '',
      registration: store.registrationNumber ? `${store.registrationLabel || 'PAN'} ${store.registrationNumber}` : '',
      siteUrl: env.siteUrl || '',
    },
    delivery: {
      charge: Number(store.deliveryCharge) || 0,
      freeAbove: Number(store.freeDeliveryThreshold) || 0,
      eta: store.deliveryEta || '',
    },
    payments: {
      esewaMode: esewa.mode || 'sandbox',
      merchantCode: esewa.merchantCode || '',
      usingTestSecret: !esewa.secretKey || esewa.secretKey === ESEWA_TEST_SECRET,
      cardEnabled: Boolean(esewa.cardEnabled),
      cashOnDelivery: true,
    },
    notifications: {
      email: { configured: Boolean(env.mailConfigured), host: mail.host || '', port: Number(mail.port) || 0, from: mail.fromAddress || '' },
      whatsapp: { provider: whatsapp.provider || 'none', configured: (whatsapp.provider || 'none') !== 'none' },
    },
    security: {
      httpsEnforced: Boolean(https.enforce),
      hsts: Boolean(https.enforce),
      tlsMinVersion: https.minVersion || '',
      servesTlsDirectly: Boolean(https.keyPath && https.certPath),
      cookieSecure: Boolean(cookie.secure),
      cookieSameSite: cookie.sameSite || '',
      ledgerSigning: Boolean(signing.privateKey),
      ledgerKeyId: signing.privateKey ? signing.keyId || 'default' : '',
      retiredKeys: Object.keys(signing.publicKeys || {}).length,
    },
    system: {
      environment: env.nodeEnv || '',
      databaseHost: databaseHost(env.mongoUri),
      nodeVersion,
      appVersion,
      uptimeSeconds: Math.round(uptimeSeconds),
    },
  };
};

module.exports = {
  LOW_STOCK_THRESHOLD,
  VELOCITY_DAYS,
  roleCondition,
  orderStatusCondition,
  paymentMethodCondition,
  paymentStatusCondition,
  stockStatus,
  daysOfCover,
  inventorySummary,
  customerSummary,
  ledgerVerdict,
  paymentSummary,
  databaseHost,
  settingsView,
  ESEWA_TEST_SECRET,
};
