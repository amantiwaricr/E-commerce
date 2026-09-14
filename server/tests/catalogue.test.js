'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const { createUser, createProduct, authHeader } = require('./helpers/factories');

describeWithDb('Storefront catalogue filters and facets', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    await createProduct({ name: 'Khasi Curry Cut', price: 1450, rating: 4.9, tags: ['mutton', 'bone-in'] });
    await createProduct({ name: 'Buff Boneless', price: 540, rating: 4.2, tags: ['buff', 'boneless'] });
    await createProduct({ name: 'Chicken Breast', price: 620, rating: 4.7, tags: ['chicken', 'boneless'] });
    await createProduct({ name: 'Hidden Stock', price: 100, rating: 5, isAvailable: false, tags: ['chicken'] });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('reports price bounds, average and a histogram over published products only', async () => {
    const res = await request(app).get('/api/products/facets');

    expect(res.status).toBe(200);
    // The unpublished Rs. 100 product must not drag the minimum down.
    expect(res.body.facets.price.min).toBe(540);
    expect(res.body.facets.price.max).toBe(1450);
    expect(res.body.facets.price.histogram.length).toBeGreaterThan(0);
    expect(res.body.facets.price.histogram.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('lists tags with counts, excluding unpublished products', async () => {
    const res = await request(app).get('/api/products/facets');

    const tags = Object.fromEntries(res.body.facets.tags.map((t) => [t.name, t.count]));
    expect(tags.boneless).toBe(2);
    expect(tags.chicken).toBe(1); // the hidden product's tag is not counted
  });

  it('counts products at each star threshold', async () => {
    const res = await request(app).get('/api/products/facets');

    const four = res.body.facets.ratings.find((r) => r.stars === 4);
    expect(four.count).toBe(3);
  });

  it('filters by tag', async () => {
    const res = await request(app).get('/api/products').query({ tags: 'boneless' });

    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name).sort()).toEqual(['Buff Boneless', 'Chicken Breast']);
  });

  it('filters by several tags at once', async () => {
    const res = await request(app).get('/api/products').query({ tags: 'mutton,buff' });
    expect(res.body.products).toHaveLength(2);
  });

  it('filters by minimum rating', async () => {
    const res = await request(app).get('/api/products').query({ minRating: 4.5 });

    expect(res.body.products.map((p) => p.name).sort()).toEqual(['Chicken Breast', 'Khasi Curry Cut']);
  });

  it('combines price and rating filters', async () => {
    const res = await request(app).get('/api/products').query({ minRating: 4.5, maxPrice: 700 });

    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].name).toBe('Chicken Breast');
  });

  it('rejects an out-of-range rating filter', async () => {
    const res = await request(app).get('/api/products').query({ minRating: 9 });
    expect(res.status).toBe(400);
  });
});

describeWithDb('Favourites', () => {
  let app;
  let customer;
  let product;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  beforeEach(async () => {
    customer = await createUser();
    product = await createProduct();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('requires a session', async () => {
    const res = await request(app).get('/api/favourites');
    expect(res.status).toBe(401);
  });

  it('saves, lists and removes a product', async () => {
    const added = await request(app).post(`/api/favourites/${product._id}`).set(authHeader(customer));
    expect(added.status).toBe(201);
    expect(added.body.ids).toEqual([product._id.toString()]);

    const list = await request(app).get('/api/favourites').set(authHeader(customer));
    expect(list.body.products).toHaveLength(1);
    expect(list.body.products[0].name).toBe(product.name);

    const removed = await request(app).delete(`/api/favourites/${product._id}`).set(authHeader(customer));
    expect(removed.body.ids).toEqual([]);
  });

  it('is idempotent when the same product is saved twice', async () => {
    await request(app).post(`/api/favourites/${product._id}`).set(authHeader(customer));
    const again = await request(app).post(`/api/favourites/${product._id}`).set(authHeader(customer));

    expect(again.status).toBe(200);
    expect(again.body.ids).toHaveLength(1);
  });

  it('hides products that were unpublished after being saved', async () => {
    await request(app).post(`/api/favourites/${product._id}`).set(authHeader(customer));
    await require('../src/models/Product').updateOne({ _id: product._id }, { $set: { isAvailable: false } });

    const list = await request(app).get('/api/favourites').set(authHeader(customer));
    expect(list.body.products).toHaveLength(0);
  });

  it('404s for a product that does not exist', async () => {
    const res = await request(app)
      .post('/api/favourites/0123456789abcdef01234567')
      .set(authHeader(customer));
    expect(res.status).toBe(404);
  });
});
