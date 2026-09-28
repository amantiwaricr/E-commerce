'use strict';

const {
  LOW_STOCK_THRESHOLD,
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
} = require('../src/utils/adminInsights');

describe('query conditions', () => {
  it('passes a known value through', () => {
    expect(roleCondition('admin')).toBe('admin');
    expect(orderStatusCondition('delivered')).toBe('delivered');
    expect(paymentMethodCondition('esewa')).toBe('esewa');
    expect(paymentStatusCondition('refunded')).toBe('refunded');
  });

  it('drops an unknown value instead of matching nothing', () => {
    expect(roleCondition('superuser')).toBeNull();
    expect(paymentMethodCondition('bitcoin')).toBeNull();
  });

  /* Express parses ?role[$ne]=admin into { $ne: 'admin' }. */
  it('refuses an object, so no operator can arrive from a URL', () => {
    expect(roleCondition({ $ne: 'admin' })).toBeNull();
    expect(orderStatusCondition({ $gt: '' })).toBeNull();
    expect(paymentStatusCondition(['paid'])).toBeNull();
    expect(paymentMethodCondition(undefined)).toBeNull();
  });
});

describe('stockStatus', () => {
  it('treats the threshold itself as low', () => {
    expect(stockStatus({ isAvailable: true, stock: LOW_STOCK_THRESHOLD })).toBe('low');
    expect(stockStatus({ isAvailable: true, stock: LOW_STOCK_THRESHOLD + 1 })).toBe('ok');
  });

  it('calls zero out of stock', () => {
    expect(stockStatus({ isAvailable: true, stock: 0 })).toBe('out');
  });

  it('puts a delisted product in its own group, whatever its stock', () => {
    // Not a restocking problem: nobody can buy it on purpose.
    expect(stockStatus({ isAvailable: false, stock: 0 })).toBe('hidden');
    expect(stockStatus({ isAvailable: false, stock: 40 })).toBe('hidden');
  });
});

describe('daysOfCover', () => {
  it('divides stock by the daily rate of sale', () => {
    // 30 sold in 30 days = 1 a day; 12 in stock lasts 12 days.
    expect(daysOfCover(12, 30)).toBe(12);
    expect(daysOfCover(5, 60)).toBe(2.5);
  });

  it('is null when nothing sold, rather than infinity', () => {
    expect(daysOfCover(20, 0)).toBeNull();
    expect(daysOfCover(20, undefined)).toBeNull();
  });

  it('is zero when there is nothing left to sell', () => {
    expect(daysOfCover(0, 30)).toBe(0);
  });
});

describe('inventorySummary', () => {
  const products = [
    { category: 'Fresh Meat', price: 1450, stock: 10, isAvailable: true },
    { category: 'Fresh Meat', price: 620, stock: 3, isAvailable: true },
    { category: 'Seafood', price: 980, stock: 0, isAvailable: true },
    { category: 'Seafood', price: 500, stock: 4, isAvailable: false },
  ];

  it('counts each product once, in exactly one status', () => {
    const s = inventorySummary(products);
    expect(s.skus).toBe(4);
    expect(s.ok + s.low + s.out + s.hidden).toBe(4);
    expect(s).toMatchObject({ ok: 1, low: 1, out: 1, hidden: 1 });
  });

  it('values every unit on the shelf, delisted ones included', () => {
    // 10×1450 + 3×620 + 0 + 4×500 — the delisted stock is still money.
    expect(inventorySummary(products).stockValue).toBe(14500 + 1860 + 2000);
  });

  it('leaves delisted stock out of what customers can buy', () => {
    expect(inventorySummary(products).unitsInStock).toBe(13);
  });

  it('breaks the value down by category, largest first', () => {
    const { byCategory } = inventorySummary(products);
    expect(byCategory.map((c) => c.name)).toEqual(['Fresh Meat', 'Seafood']);
    expect(byCategory[0]).toMatchObject({ skus: 2, units: 13, value: 16360 });
  });

  it('handles an empty catalogue', () => {
    expect(inventorySummary([])).toMatchObject({ skus: 0, stockValue: 0, byCategory: [] });
  });
});

describe('customerSummary', () => {
  const rows = [
    { _id: 'delivered', count: 3, amount: 6000, first: '2026-01-10', last: '2026-08-01' },
    { _id: 'pending', count: 1, amount: 1500, first: '2026-09-20', last: '2026-09-20' },
    { _id: 'cancelled', count: 2, amount: 9000, first: '2026-02-01', last: '2026-03-01' },
  ];

  it('counts every order, cancelled ones too', () => {
    expect(customerSummary(rows).orders).toBe(6);
  });

  it('leaves cancelled orders out of what was spent', () => {
    expect(customerSummary(rows).spent).toBe(7500);
  });

  it('averages over the orders that count, not all of them', () => {
    // 7500 over 4 kept orders, not 16500 over 6.
    expect(customerSummary(rows).averageOrder).toBe(1875);
  });

  it('finds the first and most recent order across every status', () => {
    const s = customerSummary(rows);
    expect(s.firstOrderAt.toISOString().slice(0, 10)).toBe('2026-01-10');
    expect(s.lastOrderAt.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('describes a customer who has never ordered', () => {
    expect(customerSummary([])).toMatchObject({ orders: 0, spent: 0, averageOrder: 0, firstOrderAt: null, lastOrderAt: null });
  });
});

describe('ledgerVerdict', () => {
  it('maps each report to the outcome the order page shows', () => {
    expect(ledgerVerdict({ entries: 2, valid: true, intact: true, signingConfigured: true })).toBe('verified');
    expect(ledgerVerdict({ entries: 2, valid: false, intact: false, signingConfigured: true })).toBe('broken');
    expect(ledgerVerdict({ entries: 2, valid: false, intact: true, signingConfigured: true })).toBe('partial');
    expect(ledgerVerdict({ entries: 2, valid: false, intact: true, signingConfigured: false })).toBe('unsigned');
  });

  it('says so when an order predates the ledger', () => {
    expect(ledgerVerdict({ entries: 0 })).toBe('none');
    expect(ledgerVerdict(null)).toBe('none');
  });

  /* Tampering must never be reported as the milder "unsigned". */
  it('calls an altered ledger broken even when nothing was ever signed', () => {
    expect(ledgerVerdict({ entries: 2, valid: false, intact: false, signingConfigured: false })).toBe('broken');
  });
});

describe('paymentSummary', () => {
  const rows = [
    { _id: { method: 'esewa', status: 'paid' }, count: 4, amount: 8000 },
    { _id: { method: 'card', status: 'paid' }, count: 1, amount: 1200 },
    { _id: { method: 'cod', status: 'unpaid' }, count: 3, amount: 4500 },
    { _id: { method: 'esewa', status: 'failed' }, count: 2, amount: 3000 },
    { _id: { method: 'esewa', status: 'refunded' }, count: 1, amount: 900 },
  ];

  it('separates money in hand from money owed', () => {
    const s = paymentSummary(rows);
    expect(s.collected).toEqual({ count: 5, amount: 9200 });
    expect(s.outstanding).toEqual({ count: 3, amount: 4500 });
    expect(s.failed).toEqual({ count: 2, amount: 3000 });
    expect(s.refunded).toEqual({ count: 1, amount: 900 });
  });

  it('does not count a cancelled, unpaid order as money owed', () => {
    const s = paymentSummary([
      ...rows,
      { _id: { method: 'cod', status: 'unpaid', cancelled: true }, count: 5, amount: 7500 },
    ]);
    expect(s.outstanding).toEqual({ count: 3, amount: 4500 });
  });

  it('still counts a refund on a cancelled order as refunded', () => {
    const s = paymentSummary([{ _id: { method: 'esewa', status: 'refunded', cancelled: true }, count: 1, amount: 900 }]);
    expect(s.refunded).toEqual({ count: 1, amount: 900 });
  });

  it('splits only what was collected by method', () => {
    const { byMethod } = paymentSummary(rows);
    expect(byMethod.esewa).toEqual({ count: 4, amount: 8000 });
    expect(byMethod.card).toEqual({ count: 1, amount: 1200 });
    // Unpaid cash is not revenue yet.
    expect(byMethod.cod).toBeUndefined();
  });
});

describe('databaseHost', () => {
  it('keeps the host and drops the credentials', () => {
    expect(databaseHost('mongodb+srv://fmn:s3cret@cluster0.ab12.mongodb.net/shop')).toBe('cluster0.ab12.mongodb.net');
    expect(databaseHost('mongodb://127.0.0.1:27017/shop')).toBe('127.0.0.1:27017');
  });

  it('shows only the first host of a replica set', () => {
    expect(databaseHost('mongodb://u:p@a.example.com:27017,b.example.com:27017/db')).toBe('a.example.com:27017');
  });

  it('is empty rather than throwing on nonsense', () => {
    expect(databaseHost('')).toBe('');
    expect(databaseHost(undefined)).toBe('');
    expect(databaseHost('postgres://x')).toBe('');
  });

  /* A password with an unencoded / or @ is malformed, and exactly the case a
     naive "text before the @" parser gets wrong — by printing half of it. */
  it('never shows any part of a malformed password', () => {
    // Exact values, not "does not contain": a one-letter fragment of a
    // password turns up inside any ordinary hostname.
    expect(databaseHost('mongodb://admin:pa/ss@db.example.com/shop')).toBe('db.example.com');
    expect(databaseHost('mongodb://admin:p@ss@db.example.com/shop')).toBe('db.example.com');
    expect(databaseHost('mongodb+srv://admin:a/b@c@cluster.example.net/shop?retryWrites=true')).toBe('cluster.example.net');
  });

  it('ignores an @ that belongs to the query string', () => {
    expect(databaseHost('mongodb://u:p@db.example.com/shop?appName=me@home')).toBe('db.example.com');
  });
});

describe('settingsView', () => {
  /* Every secret a real deployment holds, each one distinctive enough that a
     leak anywhere in the output is unmistakable. */
  const SECRETS = {
    jwt: 'JWT-SECRET-6f1c9e0b2a7d',
    esewa: 'ESEWA-LIVE-SECRET-99af',
    smtpPassword: 'SMTP-PASS-4417bd',
    smtpUser: 'smtp-user-login-7c2e',
    signingKey: 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t-PRIVATE',
    mongoPassword: 'MONGO-PASS-0e3a',
    whatsappToken: 'WA-TOKEN-d91f',
    twilioToken: 'TWILIO-TOKEN-55ab',
    seedPassword: 'SEED-ADMIN-PASS-8812',
  };

  const env = {
    nodeEnv: 'production',
    siteUrl: 'https://freshmeatnepal.com',
    mongoUri: `mongodb+srv://fmn:${SECRETS.mongoPassword}@cluster0.x.mongodb.net/shop`,
    jwtSecret: SECRETS.jwt,
    cookie: { secure: true, sameSite: 'lax' },
    https: { enforce: true, minVersion: 'TLSv1.2', keyPath: '', certPath: '' },
    txnSigning: { keyId: '2026-09-20', privateKey: SECRETS.signingKey, publicKeys: { '2025-01': 'x' } },
    esewa: { mode: 'production', merchantCode: 'FMNEPAL01', secretKey: SECRETS.esewa, cardEnabled: true },
    mail: { host: 'smtp.example.com', port: 587, user: SECRETS.smtpUser, password: SECRETS.smtpPassword, fromAddress: 'orders@freshmeatnepal.com' },
    mailConfigured: true,
    whatsapp: { provider: 'meta', meta: { token: SECRETS.whatsappToken }, twilio: { authToken: SECRETS.twilioToken } },
    store: { name: 'Fresh Meat Nepal', deliveryCharge: 100, freeDeliveryThreshold: 3000, deliveryEta: 'Same day' },
    seed: { adminPassword: SECRETS.seedPassword },
  };

  it('never carries a secret value, anywhere in the output', () => {
    const out = JSON.stringify(settingsView(env));
    Object.entries(SECRETS).forEach(([name, secret]) => {
      expect({ name, leaked: out.includes(secret) }).toEqual({ name, leaked: false });
    });
  });

  it('reduces each secret to whether it is set', () => {
    const view = settingsView(env);
    expect(view.security.ledgerSigning).toBe(true);
    expect(view.notifications.email.configured).toBe(true);
    expect(view.payments.usingTestSecret).toBe(false);
  });

  it('notices when eSewa is still on its published test secret', () => {
    const view = settingsView({ ...env, esewa: { ...env.esewa, secretKey: ESEWA_TEST_SECRET } });
    expect(view.payments.usingTestSecret).toBe(true);
  });

  it('shows the database host without its credentials', () => {
    expect(settingsView(env).system.databaseHost).toBe('cluster0.x.mongodb.net');
  });

  /* The allowlist is the point: a new env field must not appear by default. */
  it('does not pass through a field it was never told about', () => {
    const out = JSON.stringify(settingsView({ ...env, someFutureSecret: 'FUTURE-SECRET-123' }));
    expect(out).not.toContain('FUTURE-SECRET-123');
  });

  it('reports no signing key id when there is no key to go with it', () => {
    const view = settingsView({ ...env, txnSigning: { keyId: 'default', privateKey: '' } });
    expect(view.security.ledgerSigning).toBe(false);
    expect(view.security.ledgerKeyId).toBe('');
  });
});
