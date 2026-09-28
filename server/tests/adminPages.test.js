'use strict';

const crypto = require('crypto');
const request = require('supertest');

// A signing key for this suite, installed before env.js is first required so
// the orders placed below carry signed ledgers, as they would in production.
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const SIGNING_KEY = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8').toString('base64');
process.env.TXN_SIGNING_KEY_ID = 'admin-pages-test';
process.env.TXN_SIGNING_KEY = SIGNING_KEY;
delete process.env.TXN_VERIFY_KEYS;

const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');
const createApp = require('../src/app');
const Order = require('../src/models/Order');
const { env } = require('../src/config/env');
const {
  createUser, createAdmin, createProduct, authHeader, adminHeader, shippingAddress,
} = require('./helpers/factories');

describeWithDb('Admin panel detail pages', () => {
  let app;
  let admin;
  let customer;
  let goat;
  let chicken;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    admin = await createAdmin();
    customer = await createUser({ name: 'Sita Sharma' });
    goat = await createProduct({ name: 'Goat curry cut', category: 'Fresh Meat', price: 1450, stock: 20 });
    chicken = await createProduct({ name: 'Chicken breast', category: 'Fresh Meat', price: 620, stock: 3 });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  const placeOrder = async (product, quantity, user = customer) => {
    await request(app)
      .post('/api/cart/items')
      .set(authHeader(user))
      .send({ productId: product._id.toString(), quantity });
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(user))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });
    expect(res.status).toBe(201);
    return res.body.order;
  };

  const get = (path) => request(app).get(`/api/admin${path}`).set(adminHeader(admin));

  describe('access', () => {
    it.each(['/users/65f0000000000000000000aa', '/inventory', '/payments', '/ledger/audit', '/settings'])(
      '%s is refused to a customer and to an admin signed in on the storefront',
      async (path) => {
        const asCustomer = await request(app).get(`/api/admin${path}`).set(authHeader(customer));
        const asStorefrontAdmin = await request(app).get(`/api/admin${path}`).set(authHeader(admin));
        expect(asCustomer.status).toBe(403);
        expect(asStorefrontAdmin.status).toBe(403);
      }
    );
  });

  describe('GET /users/:id', () => {
    it('summarises spend without the cancelled order and shows what they usually buy', async () => {
      await placeOrder(goat, 2);
      await placeOrder(goat, 1);
      const cancelled = await placeOrder(chicken, 1);
      await request(app)
        .post(`/api/orders/${cancelled.orderNumber}/cancel`)
        .set(authHeader(customer))
        .send({ reason: 'Changed my mind' });

      const res = await get(`/users/${customer._id}`);

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ name: 'Sita Sharma', role: 'customer', isBlocked: false });
      expect(res.body.summary.orders).toBe(3);
      expect(res.body.summary.cancelled).toBe(1);
      // Rs. 1450 × 3 plus two delivery charges; the cancelled chicken is not spend.
      const kept = await Order.find({ user: customer._id, orderStatus: { $ne: 'cancelled' } }).lean();
      expect(res.body.summary.spent).toBe(kept.reduce((sum, o) => sum + o.totalAmount, 0));
      expect(res.body.usuallyBuys).toEqual([
        expect.objectContaining({ name: 'Goat curry cut', units: 3, orders: 2 }),
      ]);
      expect(res.body.recentOrders).toHaveLength(3);
      expect(res.body.recentOrders[0].orderNumber).toBe(cancelled.orderNumber);
    });

    it('never sends the password hash or the verification code', async () => {
      const res = await get(`/users/${customer._id}`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|codeHash|\$2[aby]\$|\$argon2|scrypt/i);
    });

    it('404s for an unknown customer and 400s for a malformed id', async () => {
      expect((await get('/users/65f0000000000000000000aa')).status).toBe(404);
      expect((await get('/users/not-an-id')).status).toBe(400);
    });
  });

  describe('GET /inventory', () => {
    it('reports status, recent sales and days of cover for every product', async () => {
      await createProduct({ name: 'Buff mince', stock: 0 });
      await createProduct({ name: 'Hidden line', stock: 40, isAvailable: false });
      await placeOrder(goat, 3);

      const res = await get('/inventory');

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ skus: 4, out: 1, low: 1, hidden: 1, ok: 1 });
      const row = (name) => res.body.products.find((p) => p.name === name);
      expect(row('Goat curry cut')).toMatchObject({ status: 'ok', stock: 17, soldRecently: 3 });
      // 3 sold in 30 days is 0.1 a day, so 17 on the shelf lasts 170 days.
      expect(row('Goat curry cut').daysOfCover).toBe(170);
      expect(row('Chicken breast')).toMatchObject({ status: 'low', soldRecently: 0, daysOfCover: null });
      expect(row('Buff mince').status).toBe('out');
    });

    it('filters by status and search, and ignores an operator smuggled into the category', async () => {
      await createProduct({ name: 'Buff mince', stock: 0 });

      const low = await get('/inventory?status=low');
      expect(low.body.products.map((p) => p.name)).toEqual(['Chicken breast']);

      // What the admin bell counts: low and sold out, stock ascending.
      const attention = await get('/inventory?status=attention');
      expect(attention.body.products.map((p) => p.name)).toEqual(['Buff mince', 'Chicken breast']);

      const search = await get('/inventory?search=goat');
      expect(search.body.products.map((p) => p.name)).toEqual(['Goat curry cut']);

      const injected = await get('/inventory?category[$ne]=nothing');
      expect(injected.status).toBe(200);
      expect(injected.body.products).toHaveLength(3);
    });
  });

  describe('GET /payments and GET /ledger/audit', () => {
    it('lists each order with a verified ledger verdict and totals what is owed', async () => {
      await placeOrder(goat, 1);
      await placeOrder(chicken, 2);

      const res = await get('/payments');

      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(2);
      res.body.payments.forEach((payment) => {
        expect(payment.method).toBe('cod');
        expect(payment.customer.name).toBe('Sita Sharma');
        expect(payment.ledger.verdict).toBe('verified');
        expect(payment.ledger.receipt).toMatch(/^[0-9a-f]{64}$/);
      });
      expect(res.body.summary.outstanding.count).toBe(2);
      expect(res.body.summary.collected.count).toBe(0);
      // The ledger itself stays on the server.
      expect(JSON.stringify(res.body)).not.toMatch(/"signature"|prevHash/);
    });

    it('ignores an operator smuggled into the method filter', async () => {
      await placeOrder(goat, 1);
      const res = await get('/payments?method[$ne]=esewa');
      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(1);
      expect((await get('/payments?method=esewa')).body.payments).toHaveLength(0);
    });

    it('names an order whose ledger was edited in the database', async () => {
      await placeOrder(goat, 1);
      const tampered = await placeOrder(chicken, 1);
      await Order.collection.updateOne(
        { orderNumber: tampered.orderNumber },
        { $set: { 'ledger.0.data.totalAmount': 1 } }
      );

      const payments = await get('/payments');
      const verdictOf = (n) => payments.body.payments.find((p) => p.orderNumber === n).ledger.verdict;
      expect(verdictOf(tampered.orderNumber)).toBe('broken');

      const audit = await get('/ledger/audit');
      expect(audit.status).toBe(200);
      expect(audit.body.audit).toMatchObject({
        checked: 2,
        counts: { verified: 1, broken: 1, unsigned: 0, partial: 0, none: 0 },
        broken: [tampered.orderNumber],
        signingConfigured: true,
        keyId: 'admin-pages-test',
      });
    });
  });

  describe('GET /settings', () => {
    it('reports configuration without a single secret value', async () => {
      const res = await get('/settings');

      expect(res.status).toBe(200);
      expect(res.body.settings.security).toMatchObject({ ledgerSigning: true, ledgerKeyId: 'admin-pages-test' });
      const body = JSON.stringify(res.body);
      [env.jwtSecret, SIGNING_KEY, env.txnSigning?.privateKey, env.esewa?.secretKey, env.mail?.password]
        .filter((secret) => typeof secret === 'string' && secret.length >= 6)
        .forEach((secret) => expect(body).not.toContain(secret));
    });
  });

  describe('GET /orders?user=', () => {
    it('lists one customer’s orders and ignores a user filter that is not an id', async () => {
      const other = await createUser({ name: 'Ramesh Thapa' });
      await placeOrder(goat, 1);
      await placeOrder(chicken, 1, other);

      const mine = await get(`/orders?user=${customer._id}`);
      expect(mine.status).toBe(200);
      expect(mine.body.orders.map((o) => o.user.name)).toEqual(['Sita Sharma']);

      const injected = await get('/orders?user[$ne]=65f0000000000000000000aa');
      expect(injected.status).toBe(200);
      expect(injected.body.orders).toHaveLength(2);
    });
  });

  describe('GET /users', () => {
    it('adds each customer’s order count, spend and last order', async () => {
      await placeOrder(goat, 1);

      const res = await get('/users?role=customer');
      const row = res.body.users.find((u) => u.name === 'Sita Sharma');
      expect(row).toMatchObject({ orders: 1 });
      expect(row.spent).toBeGreaterThan(0);
      expect(row.lastOrderAt).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });
  });
});
