'use strict';

const request = require('supertest');
const createApp = require('../src/app');

/**
 * Validation rejects before any controller runs, so these need no database and
 * run everywhere — they are the guard on what may become an account at all.
 */
describe('Sign-up validation', () => {
  const app = createApp();
  const VALID = { name: 'Sita Sharma', email: 'sita@example.com', password: 'correct-horse-42' };

  const expectRejected = async (payload, field) => {
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  };

  it.each([
    'not-an-email',
    'missing-at.example.com',
    '@example.com',
    'name@',
    'two@@example.com',
    'spaces in@example.com',
    '',
  ])('rejects the invalid address "%s"', async (email) => {
    await expectRejected({ ...VALID, email }, 'email');
  });

  it.each(['short1', '1234567', 'a'.repeat(7)])('rejects the too-short password "%s"', async (password) => {
    await expectRejected({ ...VALID, password }, 'password');
  });

  it('rejects a password of only digits', async () => {
    await expectRejected({ ...VALID, password: '12345678' }, 'password');
  });

  it('rejects a password built from the email name', async () => {
    await expectRejected({ ...VALID, email: 'butcher@example.com', password: 'Butcher123' }, 'password');
  });

  it('rejects a missing or blank name', async () => {
    await expectRejected({ ...VALID, name: '   ' }, 'name');
    await expectRejected({ email: VALID.email, password: VALID.password }, 'name');
  });

  it('rejects an over-long password', async () => {
    await expectRejected({ ...VALID, password: 'a'.repeat(129) }, 'password');
  });
});

describe('Code and sign-in validation', () => {
  const app = createApp();

  it.each(['abcd', '12', '12345', '1 2 3', '', '12.4'])('rejects the malformed code "%s"', async (code) => {
    const res = await request(app).post('/api/auth/verify-email').send({ email: 'a@b.com', code });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain('code');
  });

  it('requires a valid address when verifying or resending', async () => {
    expect((await request(app).post('/api/auth/verify-email').send({ email: 'nope', code: '1234' })).status).toBe(400);
    expect((await request(app).post('/api/auth/resend-code').send({ email: 'nope' })).status).toBe(400);
  });

  it('requires both fields to sign in', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.com' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ password: 'x' })).status).toBe(400);
  });

  it('no longer exposes the Google sign-in endpoint', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'anything' });
    expect(res.status).toBe(404);
  });
});
