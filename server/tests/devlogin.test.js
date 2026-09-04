'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

/**
 * Builds a fresh app with the given environment. The dev-login route is mounted
 * at require time, so the module registry must be reset for each variation.
 */
const appWith = (vars) => {
  let app;
  jest.isolateModules(() => {
    const previous = {};
    Object.entries(vars).forEach(([key, value]) => {
      previous[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });

    // eslint-disable-next-line global-require
    app = require('../src/app')();

    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
  return app;
};

describe('Development login is off unless explicitly enabled', () => {
  it('is not mounted when the flag is absent', async () => {
    const res = await request(appWith({ ENABLE_DEV_LOGIN: undefined })).post('/api/auth/dev-login').send({});
    expect(res.status).toBe(404);
  });

  it('is not mounted when the flag is false', async () => {
    const res = await request(appWith({ ENABLE_DEV_LOGIN: 'false' })).post('/api/auth/dev-login').send({});
    expect(res.status).toBe(404);
  });

  it('is refused in production even when the flag is set', async () => {
    const res = await request(appWith({ ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'production' }))
      .post('/api/auth/dev-login')
      .send({});
    expect(res.status).toBe(404);
  });
});

describeWithDb('Development login when enabled', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = appWith({ ENABLE_DEV_LOGIN: 'true' });
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('signs in as the seeded admin and returns a usable session', async () => {
    const res = await request(app).post('/api/auth/dev-login').send({});

    expect(res.status).toBe(200);
    expect(res.body.devLogin).toBe(true);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.token).toEqual(expect.any(String));

    // The issued token must actually open admin-only routes.
    const stats = await request(app).get('/api/admin/stats').set({ Authorization: `Bearer ${res.body.token}` });
    expect(stats.status).toBe(200);
  });

  it('creates a plain customer for any other address', async () => {
    const res = await request(app).post('/api/auth/dev-login').send({ email: 'shopper@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('customer');
  });

  it('reuses the account on a second dev login', async () => {
    await request(app).post('/api/auth/dev-login').send({ email: 'repeat@example.com' });
    const second = await request(app).post('/api/auth/dev-login').send({ email: 'repeat@example.com' });

    expect(second.status).toBe(200);
    const users = await request(app).get('/api/admin/users').set({ Authorization: `Bearer ${second.body.token}` });
    expect(users.status).toBe(403); // a customer cannot list users
  });

  it('rejects a malformed email', async () => {
    const res = await request(app).post('/api/auth/dev-login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
