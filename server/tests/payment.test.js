'use strict';

jest.mock('axios');

const request = require('supertest');
const axios = require('axios');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const esewa = require('../src/services/esewa.service');
const { createUser, createProduct, authHeader, shippingAddress } = require('./helpers/factories');

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

/** Builds the base64 `data` blob eSewa appends to its success redirect. */
const callbackData = (order, overrides = {}) => {
  const payload = {
    transaction_code: '000AE01',
    status: 'COMPLETE',
    total_amount: String(order.totalAmount),
    transaction_uuid: order.payment.transactionUuid,
    product_code: 'EPAYTEST',
    signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    ...overrides,
  };
  payload.signature = esewa.buildSignature(payload, payload.signed_field_names.split(','));
  return encode(payload);
};

/** Stubs eSewa's server-to-server status check. */
const stubStatus = (body) => axios.get.mockResolvedValue({ data: body });

describeWithDb('eSewa payment callbacks', () => {
  let app;
  let customer;
  let product;

  const placeEsewaOrder = async () => {
    await request(app)
      .post('/api/cart/items')
      .set(authHeader(customer))
      .send({ productId: product._id.toString(), quantity: 2 });

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(customer))
      .send({ paymentMethod: 'esewa', shippingAddress: shippingAddress() });

    return Order.findOne({ orderNumber: res.body.order.orderNumber });
  };

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    customer = await createUser();
    product = await createProduct({ price: 600, stock: 10 });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('marks the order paid only after eSewa’s status API confirms the transaction', async () => {
    const order = await placeEsewaOrder();
    stubStatus({ status: 'COMPLETE', ref_id: '0KAB1D3', total_amount: order.totalAmount });

    const res = await request(app).get('/api/payments/esewa/success').query({ data: callbackData(order) });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`/orders/${order.orderNumber}`);
    expect(res.headers.location).toContain('payment=success');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/transaction/status/'),
      expect.objectContaining({
        params: expect.objectContaining({
          transaction_uuid: order.payment.transactionUuid,
          total_amount: order.totalAmount,
          product_code: 'EPAYTEST',
        }),
      })
    );

    const settled = await Order.findById(order._id);
    expect(settled.paymentStatus).toBe('paid');
    expect(settled.orderStatus).toBe('confirmed');
    expect(settled.payment.referenceId).toBe('0KAB1D3');
    expect(settled.payment.paidAt).toBeInstanceOf(Date);
  });

  it('does not trust the redirect payload when eSewa reports the transaction as pending', async () => {
    const order = await placeEsewaOrder();
    stubStatus({ status: 'PENDING', total_amount: order.totalAmount });

    const res = await request(app).get('/api/payments/esewa/success').query({ data: callbackData(order) });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/checkout/failed');

    const settled = await Order.findById(order._id);
    expect(settled.paymentStatus).toBe('unpaid');
    expect(settled.orderStatus).toBe('pending');
  });

  it('rejects a callback whose signature does not match', async () => {
    const order = await placeEsewaOrder();
    const tampered = encode({
      ...JSON.parse(Buffer.from(callbackData(order), 'base64').toString()),
      total_amount: '1',
    });

    const res = await request(app).get('/api/payments/esewa/success').query({ data: tampered });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/checkout/failed');
    expect(axios.get).not.toHaveBeenCalled();
    expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');
  });

  it('refuses to settle when the confirmed amount differs from the order total', async () => {
    const order = await placeEsewaOrder();
    stubStatus({ status: 'COMPLETE', ref_id: 'X1', total_amount: 10 });

    const res = await request(app).get('/api/payments/esewa/success').query({ data: callbackData(order) });

    expect(res.headers.location).toContain('/checkout/failed');
    expect((await Order.findById(order._id)).paymentStatus).toBe('failed');
  });

  it('is idempotent when the same callback is replayed', async () => {
    const order = await placeEsewaOrder();
    stubStatus({ status: 'COMPLETE', ref_id: '0KAB1D3', total_amount: order.totalAmount });

    await request(app).get('/api/payments/esewa/success').query({ data: callbackData(order) });
    const replay = await request(app)
      .post('/api/payments/esewa/verify')
      .send({ data: callbackData(order) });

    expect(replay.status).toBe(200);
    expect(replay.body.alreadySettled).toBe(true);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
  });

  it('returns 404 for a callback that matches no order', async () => {
    const res = await request(app)
      .post('/api/payments/esewa/verify')
      .send({
        data: callbackData({ totalAmount: 500, payment: { transactionUuid: 'FMN-9999-99999-deadbeef' } }),
      });

    expect(res.status).toBe(404);
  });

  it('cancels the order and returns reserved stock when payment fails', async () => {
    const order = await placeEsewaOrder();
    expect((await Product.findById(product._id)).stock).toBe(8);

    const res = await request(app)
      .get('/api/payments/esewa/failure')
      .query({ data: callbackData(order, { status: 'CANCELED' }) });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/checkout/failed');

    const settled = await Order.findById(order._id);
    expect(settled.paymentStatus).toBe('failed');
    expect(settled.orderStatus).toBe('cancelled');
    expect((await Product.findById(product._id)).stock).toBe(10);
  });

  it('issues a fresh transaction id when the customer retries an abandoned payment', async () => {
    const order = await placeEsewaOrder();
    const originalUuid = order.payment.transactionUuid;

    const res = await request(app).post(`/api/orders/${order.orderNumber}/pay`).set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.payment.fields.transaction_uuid).not.toBe(originalUuid);
    expect(res.body.payment.fields.signature).toBe(esewa.buildSignature(res.body.payment.fields));
  });

  it('will not re-open payment on an order that is already paid', async () => {
    const order = await placeEsewaOrder();
    stubStatus({ status: 'COMPLETE', ref_id: 'R1', total_amount: order.totalAmount });
    await request(app).get('/api/payments/esewa/success').query({ data: callbackData(order) });

    const res = await request(app).post(`/api/orders/${order.orderNumber}/pay`).set(authHeader(customer));
    expect(res.status).toBe(400);
  });

  it('lists the payment methods this deployment supports', async () => {
    const res = await request(app).get('/api/payments/methods');

    expect(res.status).toBe(200);
    expect(res.body.methods.map((m) => m.id)).toEqual(['esewa', 'cod', 'card']);
    expect(res.body.mode).toBe('sandbox');
  });
});
