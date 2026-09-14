'use strict';

const request = require('supertest');
const { describeWithDb, connect, clear, disconnect } = require('./helpers/db');

const createApp = require('../src/app');
const User = require('../src/models/User');
const otp = require('../src/services/otp.service');
const { authHeader, createUser, createAdmin, DEFAULT_PASSWORD } = require('./helpers/factories');

const SIGNUP = { name: 'Sita Sharma', email: 'Sita.Sharma@example.com', password: 'correct-horse-42' };

describeWithDb('Registration and email verification', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  const registerAndGetCode = async (payload = SIGNUP) => {
    const res = await request(app).post('/api/auth/register').send(payload);
    return { res, code: res.body.devCode };
  };

  it('creates an unverified account and issues a code, without a session', async () => {
    const { res } = await registerAndGetCode();

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.email).toBe('sita.sharma@example.com');

    const user = await User.findOne({ email: 'sita.sharma@example.com' });
    expect(user.isEmailVerified).toBe(false);
    expect(user.name).toBe('Sita Sharma');
  });

  it('never stores the password in clear text', async () => {
    await registerAndGetCode();

    const user = await User.findOne({ email: 'sita.sharma@example.com' }).select('+passwordHash');
    expect(user.passwordHash).not.toContain(SIGNUP.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await user.verifyPassword(SIGNUP.password)).toBe(true);
    expect(await user.verifyPassword('not-the-password')).toBe(false);
  });

  it('stores the code hashed, never in clear text', async () => {
    const { code } = await registerAndGetCode();

    const user = await User.findOne({ email: 'sita.sharma@example.com' }).select('+emailVerification.codeHash');
    expect(user.emailVerification.codeHash).toBeTruthy();
    expect(user.emailVerification.codeHash).not.toContain(code);
  });

  it('refuses to sign in before the address is verified', async () => {
    await registerAndGetCode();

    const res = await request(app).post('/api/auth/login').send({ email: SIGNUP.email, password: SIGNUP.password });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your email/i);
    // The UI relies on this flag to open the code screen.
    expect(res.body.errors).toContainEqual({ field: 'email', message: 'unverified' });
  });

  it('activates the account and signs in when the code is correct', async () => {
    const { code } = await registerAndGetCode();
    expect(code).toMatch(/^\d{4}$/);

    const res = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.isEmailVerified).toBe(true);

    // The session works straight away.
    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('sita.sharma@example.com');
  });

  it('lets the account sign in normally once verified', async () => {
    const { code } = await registerAndGetCode();
    await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });

    const res = await request(app).post('/api/auth/login').send({ email: SIGNUP.email, password: SIGNUP.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('sita.sharma@example.com');
  });

  it('rejects a wrong code and counts the attempt down', async () => {
    await registerAndGetCode();

    const res = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code: '0000' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not correct/i);

    const user = await User.findOne({ email: 'sita.sharma@example.com' }).select('+emailVerification.attempts');
    expect(user.emailVerification.attempts).toBe(1);
    expect(user.isEmailVerified).toBe(false);
  });

  it('locks the code after too many wrong attempts', async () => {
    const { code } = await registerAndGetCode();
    const wrong = code === '1111' ? '2222' : '1111';

    for (let i = 0; i < otp.MAX_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code: wrong });
    }

    // Even the correct code is refused once the attempt budget is spent.
    const res = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/request a new code/i);
    expect((await User.findOne({ email: 'sita.sharma@example.com' })).isEmailVerified).toBe(false);
  });

  it('rejects an expired code', async () => {
    const { code } = await registerAndGetCode();

    await User.updateOne(
      { email: 'sita.sharma@example.com' },
      { $set: { 'emailVerification.expiresAt': new Date(Date.now() - 1000) } }
    );

    const res = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('will not let a code be used twice', async () => {
    const { code } = await registerAndGetCode();
    await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });

    // A replay finds an already-verified account, not a reusable code.
    const user = await User.findOne({ email: 'sita.sharma@example.com' }).select('+emailVerification.codeHash');
    expect(user.emailVerification?.codeHash).toBeFalsy();
  });

  it('throttles resending', async () => {
    await registerAndGetCode();

    const res = await request(app).post('/api/auth/resend-code').send({ email: SIGNUP.email });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/wait/i);
  });

  it('issues a different code on resend once the cooldown has passed', async () => {
    const { code: first } = await registerAndGetCode();

    await User.updateOne(
      { email: 'sita.sharma@example.com' },
      { $set: { 'emailVerification.lastSentAt': new Date(Date.now() - 120000) } }
    );

    const res = await request(app).post('/api/auth/resend-code').send({ email: SIGNUP.email });
    expect(res.status).toBe(200);
    expect(res.body.devCode).toMatch(/^\d{4}$/);

    // The old code no longer works.
    const stale = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code: first });
    if (first !== res.body.devCode) expect(stale.status).toBe(400);
  });

  it('does not reveal whether an address is registered when resending', async () => {
    const res = await request(app).post('/api/auth/resend-code').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that account/i);
  });

  it('rejects a duplicate registration of a verified account', async () => {
    const { code } = await registerAndGetCode();
    await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });

    const res = await request(app).post('/api/auth/register').send(SIGNUP);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('lets an unverified signup be retried with a new password', async () => {
    await registerAndGetCode();

    const retry = await request(app)
      .post('/api/auth/register')
      .send({ ...SIGNUP, password: 'a-different-password-9' });
    expect(retry.status).toBe(201);

    await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code: retry.body.devCode });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: SIGNUP.email, password: 'a-different-password-9' });
    expect(res.status).toBe(200);
  });

  it('treats the email address case-insensitively', async () => {
    const { code } = await registerAndGetCode();
    await request(app).post('/api/auth/verify-email').send({ email: 'SITA.SHARMA@EXAMPLE.COM', code });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Sita.Sharma@Example.com  ', password: SIGNUP.password });
    expect(res.status).toBe(200);
  });
});

describeWithDb('Registration validation', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  const badField = async (payload, field) => {
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
    expect(await User.countDocuments({})).toBe(0);
  };

  it.each([
    ['not-an-email', 'email'],
    ['missing@', 'email'],
    ['@example.com', 'email'],
    ['spaces in@example.com', 'email'],
  ])('rejects the invalid address %s', async (email) => {
    await badField({ ...SIGNUP, email }, 'email');
  });

  it('rejects a password under 8 characters', async () => {
    await badField({ ...SIGNUP, password: 'short1' }, 'password');
  });

  it('rejects a password of only digits', async () => {
    await badField({ ...SIGNUP, password: '12345678' }, 'password');
  });

  it('rejects a password containing the email name', async () => {
    await badField({ ...SIGNUP, email: 'butcher@example.com', password: 'butcher123' }, 'password');
  });

  it('requires a name', async () => {
    await badField({ ...SIGNUP, name: '   ' }, 'name');
  });

  it('rejects a non-numeric or wrong-length code', async () => {
    await request(app).post('/api/auth/register').send(SIGNUP);
    for (const code of ['abcd', '12', '123456']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/auth/verify-email').send({ email: SIGNUP.email, code });
      expect(res.status).toBe(400);
    }
  });
});

describeWithDb('Sign-in and sessions', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
  });
  afterEach(async () => clear());
  afterAll(async () => disconnect());

  it('gives the same message for a wrong password and an unknown address', async () => {
    await createUser({ email: 'known@example.com' });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'known@example.com', password: 'not-the-password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknown.body.message);
  });

  it('sets an httpOnly session cookie', async () => {
    const user = await createUser({ email: 'cookie@example.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('fmn_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
  });

  it('refuses a blocked account', async () => {
    const user = await createUser({ isBlocked: true });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no token, and a tampered one', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: 'Bearer not.a.jwt' })).status).toBe(401);
  });

  it('keeps customers out of the admin API and lets admins in', async () => {
    const customer = await createUser();
    const admin = await createAdmin();

    expect((await request(app).get('/api/admin/stats').set(authHeader(customer))).status).toBe(403);
    expect((await request(app).get('/api/admin/stats').set(authHeader(admin))).status).toBe(200);
  });

  it('never returns the password hash', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/auth/me').set(authHeader(user));

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('$2a$');
  });

  it('changes a password only with the current one', async () => {
    const user = await createUser();

    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set(authHeader(user))
      .send({ currentPassword: 'nope', newPassword: 'brand-new-password-1' });
    expect(wrong.status).toBe(400);

    const right = await request(app)
      .post('/api/auth/change-password')
      .set(authHeader(user))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'brand-new-password-1' });
    expect(right.status).toBe(200);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'brand-new-password-1' });
    expect(relogin.status).toBe(200);

    const old = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(old.status).toBe(401);
  });
});
