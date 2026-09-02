'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const authController = require('../src/controllers/auth.controller');
const User = require('../src/models/User');
const { authHeader, createUser, createAdmin } = require('./helpers/factories');

/** Stands in for Google's token endpoint so no network call is made. */
const stubGoogle = (payload) =>
  authController.__setOAuthClient({
    verifyIdToken: jest.fn(async () => {
      if (payload instanceof Error) throw payload;
      return { getPayload: () => payload };
    }),
  });

const GOOGLE_PROFILE = {
  sub: '1234567890',
  email: 'Sita.Sharma@gmail.com',
  email_verified: true,
  name: 'Sita Sharma',
  picture: 'https://lh3.googleusercontent.com/a/photo',
};

describeWithDb('Authentication (Google OAuth)', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('creates a customer account on first Google sign-in', async () => {
    stubGoogle(GOOGLE_PROFILE);

    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-google-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'sita.sharma@gmail.com', name: 'Sita Sharma', role: 'customer' });

    const stored = await User.findOne({ email: 'sita.sharma@gmail.com' });
    expect(stored.googleId).toBe(GOOGLE_PROFILE.sub);
    expect(stored.role).toBe('customer');
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('sets an httpOnly session cookie', async () => {
    stubGoogle(GOOGLE_PROFILE);
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-google-id-token' });

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('fmn_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
  });

  it('reuses the existing account on a second sign-in', async () => {
    stubGoogle(GOOGLE_PROFILE);
    await request(app).post('/api/auth/google').send({ credential: 'token-1' });
    await request(app).post('/api/auth/google').send({ credential: 'token-2' });

    expect(await User.countDocuments({ email: 'sita.sharma@gmail.com' })).toBe(1);
  });

  it('links a seeded admin account by email and keeps the admin role', async () => {
    await createAdmin({ email: 'sita.sharma@gmail.com', googleId: 'seed-admin:sita.sharma@gmail.com' });
    stubGoogle(GOOGLE_PROFILE);

    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-google-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(await User.countDocuments({ email: 'sita.sharma@gmail.com' })).toBe(1);

    // The seeded placeholder id is replaced by the real Google subject.
    const claimed = await User.findOne({ email: 'sita.sharma@gmail.com' });
    expect(claimed.googleId).toBe(GOOGLE_PROFILE.sub);
  });

  it('rejects a credential Google will not verify', async () => {
    stubGoogle(new Error('Invalid token signature'));

    const res = await request(app).post('/api/auth/google').send({ credential: 'forged-token' });

    expect(res.status).toBe(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('rejects a Google account with an unverified email', async () => {
    stubGoogle({ ...GOOGLE_PROFILE, email_verified: false });
    const res = await request(app).post('/api/auth/google').send({ credential: 'unverified' });
    expect(res.status).toBe(401);
  });

  it('requires a credential in the body', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: 'credential' });
  });

  it('refuses to sign in a blocked account', async () => {
    await createUser({ email: 'sita.sharma@gmail.com', googleId: GOOGLE_PROFILE.sub, isBlocked: true });
    stubGoogle(GOOGLE_PROFILE);

    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-google-id-token' });
    expect(res.status).toBe(403);
  });
});

describeWithDb('Session-protected routes', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('returns the current user for a valid token', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/auth/me').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set({ Authorization: 'Bearer not.a.jwt' });
    expect(res.status).toBe(401);
  });

  it('keeps customers out of the admin API', async () => {
    const customer = await createUser();
    const res = await request(app).get('/api/admin/stats').set(authHeader(customer));

    expect(res.status).toBe(403);
  });

  it('lets an admin into the admin API', async () => {
    const admin = await createAdmin();
    const res = await request(app).get('/api/admin/stats').set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveProperty('todayOrders');
  });

  it('lets a customer save their phone number', async () => {
    const user = await createUser({ phone: '' });
    const res = await request(app).patch('/api/auth/me').set(authHeader(user)).send({ phone: '9841000000' });

    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('9841000000');
  });

  it('rejects a phone number that is not a Nepali mobile', async () => {
    const user = await createUser();
    const res = await request(app).patch('/api/auth/me').set(authHeader(user)).send({ phone: '12345' });

    expect(res.status).toBe(400);
  });
});
