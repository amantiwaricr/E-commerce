'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const Product = require('../src/models/Product');
const Review = require('../src/models/Review');
const { syncAllProductRatings } = require('../src/services/rating.service');
const {
  createUser, createAdmin, createProduct, authHeader, adminHeader, shippingAddress,
} = require('./helpers/factories');

describeWithDb('Product ratings and reviews', () => {
  let app;
  let admin;
  let sita;
  let goat;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    admin = await createAdmin();
    sita = await createUser({ name: 'Sita Sharma' });
    goat = await createProduct({ name: 'Goat curry cut', price: 1450, stock: 20 });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  const placeOrder = async (user, product = goat) => {
    await request(app).post('/api/cart/items').set(authHeader(user)).send({ productId: product._id.toString(), quantity: 1 });
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(user))
      .send({ paymentMethod: 'cod', shippingAddress: shippingAddress() });
    expect(res.status).toBe(201);
    return res.body.order;
  };

  const deliver = async (order) => {
    for (const status of ['processing', 'shipped', 'delivered']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .patch(`/api/admin/orders/${order.orderNumber}/status`)
        .set(adminHeader(admin))
        .send({ status });
      expect(res.status).toBe(200);
    }
  };

  const customerWhoReceived = async (name, product = goat) => {
    const user = await createUser({ name });
    await deliver(await placeOrder(user, product));
    return user;
  };

  const rate = (user, body, product = goat) =>
    request(app).put(`/api/products/${product.slug}/reviews/mine`).set(authHeader(user)).send(body);

  describe('who may rate', () => {
    it('asks a signed-out visitor to sign in', async () => {
      const res = await request(app).put(`/api/products/${goat.slug}/reviews/mine`).send({ rating: 5 });
      expect(res.status).toBe(401);
    });

    it('refuses a customer whose order has not been delivered yet', async () => {
      await placeOrder(sita);

      const mine = await request(app).get(`/api/products/${goat.slug}/reviews/mine`).set(authHeader(sita));
      expect(mine.body).toMatchObject({ eligible: false, reason: 'not-delivered', review: null });

      const res = await rate(sita, { rating: 5 });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/delivered/i);
      expect(await Review.countDocuments()).toBe(0);
    });

    it('refuses a customer who bought something else', async () => {
      const chicken = await createProduct({ name: 'Chicken breast', stock: 20 });
      await deliver(await placeOrder(sita, chicken));
      expect((await rate(sita, { rating: 5 })).status).toBe(403);
    });

    it('refuses a store account, even one with a delivered order', async () => {
      await deliver(await placeOrder(admin));
      const res = await rate(admin, { rating: 5 });
      expect(res.status).toBe(403);
    });

    it('lets a customer rate once the order is delivered', async () => {
      await deliver(await placeOrder(sita));

      const mine = await request(app).get(`/api/products/${goat.slug}/reviews/mine`).set(authHeader(sita));
      expect(mine.body).toMatchObject({ eligible: true, review: null });

      const res = await rate(sita, { rating: 4, comment: '  Tender, and cut exactly as asked.  ' });
      expect(res.status).toBe(201);
      expect(res.body.review).toMatchObject({ rating: 4, comment: 'Tender, and cut exactly as asked.' });
      expect(res.body.summary).toMatchObject({ average: 4, count: 1 });
    });
  });

  describe('validation', () => {
    beforeEach(async () => deliver(await placeOrder(sita)));

    it.each([
      ['no rating', {}, /1 to 5/],
      ['zero stars', { rating: 0 }, /1 to 5/],
      ['six stars', { rating: 6 }, /1 to 5/],
      ['half a star', { rating: 3.5 }, /1 to 5/],
      ['a word for a rating', { rating: '5 stars' }, /1 to 5/],
      ['a comment over 1,000 characters', { rating: 5, comment: 'x'.repeat(1001) }, /1,000/],
      ['an object for a comment', { rating: 5, comment: { $gt: '' } }, /text/],
    ])('rejects %s', async (label, body, message) => {
      const res = await rate(sita, body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(message);
      expect(await Review.countDocuments()).toBe(0);
    });

    it('accepts a rating with no comment', async () => {
      const res = await rate(sita, { rating: 5 });
      expect(res.status).toBe(201);
      expect(res.body.review.comment).toBe('');
    });
  });

  describe('the product rating', () => {
    it('averages every customer once, and an edit replaces the old vote', async () => {
      await deliver(await placeOrder(sita));
      const ram = await customerWhoReceived('Ram Thapa');

      await rate(sita, { rating: 5 });
      await rate(ram, { rating: 2 });
      let stored = await Product.findById(goat._id).lean();
      expect(stored).toMatchObject({ rating: 3.5, reviewCount: 2 });

      const edited = await rate(sita, { rating: 3, comment: 'Second visit was fattier' });
      expect(edited.status).toBe(200);
      expect(edited.body.created).toBe(false);
      expect(await Review.countDocuments({ product: goat._id })).toBe(2);
      stored = await Product.findById(goat._id).lean();
      expect(stored).toMatchObject({ rating: 2.5, reviewCount: 2 });
      expect(stored.recentRatings.map((r) => r.initial)).toEqual(['R', 'S']);
    });

    it('drops a deleted review from the rating', async () => {
      await deliver(await placeOrder(sita));
      await rate(sita, { rating: 5 });

      const res = await request(app).delete(`/api/products/${goat.slug}/reviews/mine`).set(authHeader(sita));
      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ average: 0, count: 0 });
      expect(await Product.findById(goat._id).lean()).toMatchObject({ rating: 0, reviewCount: 0, recentRatings: [] });

      const again = await request(app).delete(`/api/products/${goat.slug}/reviews/mine`).set(authHeader(sita));
      expect(again.status).toBe(404);
    });

    it('cannot be set by hand through the admin product form', async () => {
      const res = await request(app)
        .patch(`/api/admin/products/${goat._id}`)
        .set(adminHeader(admin))
        .send({ rating: 5, reviewCount: 999, price: 1500 });
      expect(res.status).toBe(200);
      expect(await Product.findById(goat._id).lean()).toMatchObject({ price: 1500, rating: 0, reviewCount: 0 });
    });

    it('is repaired at start-up when it disagrees with the reviews', async () => {
      await Product.updateOne({ _id: goat._id }, { rating: 4.7, reviewCount: 214 });
      await deliver(await placeOrder(sita));
      await Review.create({ product: goat._id, user: sita._id, order: goat._id, rating: 3 });

      const result = await syncAllProductRatings();
      expect(result.corrected).toBeGreaterThanOrEqual(1);
      expect(await Product.findById(goat._id).lean()).toMatchObject({ rating: 3, reviewCount: 1 });
    });
  });

  describe('the public list', () => {
    beforeEach(async () => {
      await deliver(await placeOrder(sita));
      await rate(sita, { rating: 5, comment: 'Best khasi in Lalitpur' });
      const ram = await customerWhoReceived('Ram Bahadur Thapa');
      await rate(ram, { rating: 1, comment: 'Arrived late' });
    });

    it('shows the summary and reviews without surnames or emails', async () => {
      const res = await request(app).get(`/api/products/${goat.slug}/reviews`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ average: 3, count: 2, distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 } });
      expect(res.body.reviews.map((r) => r.author).sort()).toEqual(['Ram T.', 'Sita S.']);
      expect(JSON.stringify(res.body)).not.toMatch(/example\.com|Sharma|Thapa|"user"/);
    });

    it('sorts by rating and filters by stars', async () => {
      const lowest = await request(app).get(`/api/products/${goat.slug}/reviews?sort=lowest`);
      expect(lowest.body.reviews.map((r) => r.rating)).toEqual([1, 5]);
      const fives = await request(app).get(`/api/products/${goat.slug}/reviews?stars=5`);
      expect(fives.body.reviews.map((r) => r.comment)).toEqual(['Best khasi in Lalitpur']);
      // The summary always describes every review, whatever the filter.
      expect(fives.body.summary.count).toBe(2);
    });

    it('ignores operators smuggled into the query', async () => {
      const res = await request(app).get(`/api/products/${goat.slug}/reviews?sort[$ne]=x&stars[$gt]=0`);
      expect(res.status).toBe(200);
      expect(res.body.sort).toBe('newest');
      expect(res.body.reviews).toHaveLength(2);
    });

    it('404s for an unpublished product', async () => {
      await Product.updateOne({ _id: goat._id }, { isAvailable: false });
      expect((await request(app).get(`/api/products/${goat.slug}/reviews`)).status).toBe(404);
    });
  });

  describe('moderation', () => {
    let review;
    beforeEach(async () => {
      await deliver(await placeOrder(sita));
      review = (await rate(sita, { rating: 1, comment: 'rude words' })).body.review;
    });

    it('is admin-only', async () => {
      expect((await request(app).get('/api/admin/reviews').set(authHeader(sita))).status).toBe(403);
      expect((await request(app).patch(`/api/admin/reviews/${review.id}`).set(authHeader(sita)).send({ isHidden: true })).status).toBe(403);
    });

    it('hides a review from the list and the rating, and can show it again', async () => {
      const hide = await request(app).patch(`/api/admin/reviews/${review.id}`).set(adminHeader(admin)).send({ isHidden: true });
      expect(hide.status).toBe(200);
      expect(hide.body.summary.count).toBe(0);
      expect((await request(app).get(`/api/products/${goat.slug}/reviews`)).body.reviews).toHaveLength(0);
      expect(await Product.findById(goat._id).lean()).toMatchObject({ rating: 0, reviewCount: 0 });

      // Editing a hidden review does not bring it back.
      await rate(sita, { rating: 5, comment: 'now polite' });
      expect((await Review.findById(review.id).lean()).isHidden).toBe(true);
      const mine = await request(app).get(`/api/products/${goat.slug}/reviews/mine`).set(authHeader(sita));
      expect(mine.body.review.isHidden).toBe(true);

      const list = await request(app).get('/api/admin/reviews?status=hidden').set(adminHeader(admin));
      expect(list.body.reviews).toHaveLength(1);
      expect(list.body.reviews[0]).toMatchObject({ isHidden: true, customer: { name: 'Sita Sharma' }, product: { name: 'Goat curry cut' } });
      expect(list.body.summary.hidden).toBe(1);

      await request(app).patch(`/api/admin/reviews/${review.id}`).set(adminHeader(admin)).send({ isHidden: false });
      expect(await Product.findById(goat._id).lean()).toMatchObject({ rating: 5, reviewCount: 1 });
    });

    it('searches by product, customer and comment', async () => {
      const get = (q) => request(app).get(`/api/admin/reviews?search=${encodeURIComponent(q)}`).set(adminHeader(admin));
      expect((await get('goat')).body.reviews).toHaveLength(1);
      expect((await get('sita')).body.reviews).toHaveLength(1);
      expect((await get('rude')).body.reviews).toHaveLength(1);
      expect((await get('nothing-matches')).body.reviews).toHaveLength(0);
    });

    it('rejects a non-boolean isHidden', async () => {
      const res = await request(app).patch(`/api/admin/reviews/${review.id}`).set(adminHeader(admin)).send({ isHidden: 'yes' });
      expect(res.status).toBe(400);
    });

    it('removes the reviews of a deleted product', async () => {
      await request(app).delete(`/api/admin/products/${goat._id}`).set(adminHeader(admin));
      expect(await Review.countDocuments()).toBe(0);
    });
  });
});
