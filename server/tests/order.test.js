'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const { createUser, createAdmin, createProduct, authHeader, shippingAddress } = require('./helpers/factories');
const esewa = require('../src/services/esewa.service');

describeWithDb('Cart and order creation', () => {
  let app;
  let customer;
  let product;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    customer = await createUser();
    product = await createProduct({ price: 600, stock: 10 });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  const addToCart = (quantity = 2) =>
    request(app)
      .post('/api/cart/items')
      .set(authHeader(customer))
      .send({ productId: product._id.toString(), quantity });

  it('adds an item to the cart and prices it from the catalogue', async () => {
    const res = await addToCart(2);

    expect(res.status).toBe(201);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.itemsTotal).toBe(1200);
    expect(res.body.cart.deliveryCharge).toBe(100);
    expect(res.body.cart.totalAmount).toBe(1300);
  });

  it('refuses to add more than the available stock', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set(authHeader(customer))
      .send({ productId: product._id.toString(), quantity: 99 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/left in stock/i);
  });

  it('creates a confirmed COD order, decrements stock and empties the cart', async () => {
    await addToCart(2);

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      orderStatus: 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod: 'cod',
      itemsTotal: 1200,
      deliveryCharge: 100,
      totalAmount: 1300,
    });
    expect(res.body.order.orderNumber).toMatch(/^FMN-\d{4}-\d{5}$/);
    expect(res.body.order.trackingInfo.timeline.map((t) => t.status)).toEqual(['pending', 'confirmed']);

    // Assert what was actually persisted, not just what the response echoed —
    // a duplicated timeline entry is invisible in the in-memory document.
    const stored = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    expect(stored.trackingInfo.timeline.map((t) => t.status)).toEqual(['pending', 'confirmed']);
    expect(stored.orderStatus).toBe('confirmed');

    expect((await Product.findById(product._id)).stock).toBe(8);
    expect((await Cart.findOne({ user: customer._id })).items).toHaveLength(0);
  });

  it('creates a pending eSewa order with a correctly signed payment payload', async () => {
    await addToCart(2);

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'esewa', shippingAddress: shippingAddress() });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ orderStatus: 'pending', paymentStatus: 'unpaid' });
    expect(res.body.payment.fields.total_amount).toBe('1300');
    expect(res.body.payment.fields.transaction_uuid).toContain(res.body.order.orderNumber);
    expect(res.body.payment.fields.signature).toBe(esewa.buildSignature(res.body.payment.fields));

    const stored = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    expect(stored.trackingInfo.timeline.map((t) => t.status)).toEqual(['pending']);
  });

  it('gives each order a unique, sequential order number', async () => {
    await addToCart(1);
    const first = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    await addToCart(1);
    const second = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    expect(first.body.order.orderNumber).not.toBe(second.body.order.orderNumber);
    expect(await Order.countDocuments({})).toBe(2);
  });

  it('rejects checkout with an empty cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cart is empty/i);
  });

  it('rejects checkout with an invalid delivery phone number', async () => {
    await addToCart(1);
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress({ phone: '12345' }) });

    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain('shippingAddress.phone');
    expect(await Order.countDocuments({})).toBe(0);
  });

  it('rejects an unknown payment method', async () => {
    await addToCart(1);
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'bitcoin', shippingAddress: shippingAddress() });

    expect(res.status).toBe(400);
  });

  it('does not oversell when stock ran out between adding to cart and checkout', async () => {
    await addToCart(2);
    await Product.updateOne({ _id: product._id }, { $set: { stock: 1 } });

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    expect(res.status).toBe(400);
    expect(await Order.countDocuments({})).toBe(0);
    expect((await Product.findById(product._id)).stock).toBe(1);
  });

  it('requires authentication to check out', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    expect(res.status).toBe(401);
  });
});

describeWithDb('Order tracking and lifecycle', () => {
  let app;
  let customer;
  let admin;
  let product;

  const placeCodOrder = async () => {
    await request(app)
      .post('/api/cart/items')
      .set(authHeader(customer))
      .send({ productId: product._id.toString(), quantity: 2 });

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });

    return res.body.order;
  };

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    customer = await createUser();
    admin = await createAdmin();
    product = await createProduct({ price: 600, stock: 10 });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('lists the customer’s own orders and hides other customers’ orders', async () => {
    const order = await placeCodOrder();
    const other = await createUser();

    const mine = await request(app).get('/api/orders').set(authHeader(customer));
    expect(mine.body.orders).toHaveLength(1);

    const theirs = await request(app).get('/api/orders').set(authHeader(other));
    expect(theirs.body.orders).toHaveLength(0);

    const forbidden = await request(app).get(`/api/orders/${order.orderNumber}`).set(authHeader(other));
    expect(forbidden.status).toBe(403);
  });

  it('returns the tracking timeline on the order detail', async () => {
    const order = await placeCodOrder();
    const res = await request(app).get(`/api/orders/${order.orderNumber}`).set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.order.trackingInfo.timeline[0]).toMatchObject({ status: 'pending', note: 'Order placed' });
  });

  it('lets a customer cancel before dispatch and returns the stock', async () => {
    const order = await placeCodOrder();
    expect((await Product.findById(product._id)).stock).toBe(8);

    const res = await request(app)
      .post(`/api/orders/${order.orderNumber}/cancel`)
      .set(authHeader(customer))
      .send({ reason: 'Ordered by mistake' });

    expect(res.status).toBe(200);
    expect(res.body.order.orderStatus).toBe('cancelled');
    expect((await Product.findById(product._id)).stock).toBe(10);
  });

  it('advances an order through the allowed statuses and records who changed it', async () => {
    const order = await placeCodOrder();

    const processing = await request(app)
      .patch(`/api/admin/orders/${order.orderNumber}/status`)
      .set(authHeader(admin))
      .send({ status: 'processing', note: 'Butchering started' });
    expect(processing.status).toBe(200);

    const shipped = await request(app)
      .patch(`/api/admin/orders/${order.orderNumber}/status`)
      .set(authHeader(admin))
      .send({ status: 'shipped', note: 'Out with the rider' });

    expect(shipped.status).toBe(200);
    expect(shipped.body.order.orderStatus).toBe('shipped');
    expect(shipped.body.order.trackingInfo.timeline.map((t) => t.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
      'shipped',
    ]);
  });

  it('rejects an illegal status transition', async () => {
    const order = await placeCodOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${order.orderNumber}/status`)
      .set(authHeader(admin))
      .send({ status: 'delivered' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot become delivered/i);
  });

  it('marks a COD order paid once it is delivered', async () => {
    const order = await placeCodOrder();

    for (const status of ['processing', 'shipped', 'delivered']) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .patch(`/api/admin/orders/${order.orderNumber}/status`)
        .set(authHeader(admin))
        .send({ status });
    }

    const stored = await Order.findOne({ orderNumber: order.orderNumber });
    expect(stored.orderStatus).toBe('delivered');
    expect(stored.paymentStatus).toBe('paid');
  });

  it('stores admin tracking information', async () => {
    const order = await placeCodOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${order.orderNumber}/tracking`)
      .set(authHeader(admin))
      .send({ carrier: 'FMN Riders', trackingCode: 'RID-889', estimatedDelivery: 'Today, 6 PM', note: 'Rider assigned' });

    expect(res.status).toBe(200);
    expect(res.body.order.trackingInfo).toMatchObject({ carrier: 'FMN Riders', trackingCode: 'RID-889' });
    expect(res.body.order.trackingInfo.timeline.at(-1).note).toBe('Rider assigned');
  });

  it('keeps order management out of a customer’s reach', async () => {
    const order = await placeCodOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${order.orderNumber}/status`)
      .set(authHeader(customer))
      .send({ status: 'shipped' });

    expect(res.status).toBe(403);
  });
});
