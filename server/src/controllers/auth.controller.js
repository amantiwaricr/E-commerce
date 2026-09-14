'use strict';

const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const logger = require('../utils/logger');

let client = null;
const getClient = () => {
  if (!client) client = new OAuth2Client(env.googleClientId);
  return client;
};

/**
 * Verifies a Google ID token (the `credential` returned by @react-oauth/google)
 * and returns its payload. Test seam: `__setOAuthClient` swaps the verifier.
 */
const verifyGoogleCredential = async (credential) => {
  const ticket = await getClient().verifyIdToken({ idToken: credential, audience: env.googleClientId });
  return ticket.getPayload();
};

/** Turns a google-auth-library failure into something actionable. */
const describeVerificationFailure = (message = '') => {
  const text = String(message);

  if (/audience/i.test(text)) {
    return (
      'Google sign-in is misconfigured: the client ID the browser used does not match ' +
      'GOOGLE_CLIENT_ID on the server. Both must be the exact same value — run `npm run doctor` to compare them.'
    );
  }
  if (/Token used too late|expired/i.test(text)) {
    return 'That Google sign-in took too long and expired. Please try again.';
  }
  if (/Token used too early|clock/i.test(text)) {
    return "Your computer's clock is out of sync with Google, so the sign-in could not be verified.";
  }
  if (/signature|Invalid token|Wrong number of segments|malformed/i.test(text)) {
    return 'That Google sign-in token could not be verified. Please try signing in again.';
  }
  return 'Google sign-in failed. Please try again.';
};

/**
 * POST /api/auth/google
 * Exchanges a Google ID token for a session. Creates the user on first login.
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) throw ApiError.badRequest('Google credential is required');
  if (!env.googleConfigured) {
    throw ApiError.internal('Google sign-in is not configured: set a real GOOGLE_CLIENT_ID in server/.env');
  }

  let payload;
  try {
    payload = await verifyGoogleCredential(credential);
  } catch (err) {
    // Google's messages are precise but obscure; name the actual misconfiguration
    // so a failed sign-in points at its cause instead of "try again".
    logger.warn('Google credential verification failed:', err.message);
    throw ApiError.unauthorized(describeVerificationFailure(err.message));
  }

  if (!payload?.email || !payload?.sub) throw ApiError.unauthorized('Google account did not return an email');
  if (payload.email_verified === false) throw ApiError.unauthorized('Your Google email is not verified');

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

  if (!user) {
    user = await User.create({
      name: payload.name || email.split('@')[0],
      email,
      googleId: payload.sub,
      avatar: payload.picture || '',
      role: 'customer',
      lastLoginAt: new Date(),
    });
    logger.info(`New user registered: ${email}`);
  } else {
    // Matched by googleId or by a Google-verified email, so this subject owns the
    // account: claim it outright, which also replaces a seeded placeholder id.
    user.googleId = payload.sub;
    user.name = user.name || payload.name || user.name;
    if (payload.picture) user.avatar = payload.picture;
    user.lastLoginAt = new Date();
    await user.save();
  }

  if (user.isBlocked) throw ApiError.forbidden('This account has been blocked. Contact support.');

  const token = signToken(user);
  setAuthCookie(res, token);

  return res.status(200).json({ success: true, token, user: user.toPublicJSON() });
});

/** GET /api/auth/me */
const getMe = asyncHandler(async (req, res) =>
  res.json({ success: true, user: req.user.toPublicJSON() })
);

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true, message: 'Signed out' });
});

/** PATCH /api/auth/me — customers may update their phone and saved addresses. */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, addresses } = req.body;
  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;
  if (Array.isArray(addresses)) req.user.addresses = addresses;
  await req.user.save();
  return res.json({ success: true, user: req.user.toPublicJSON() });
});

/**
 * POST /api/auth/dev-login  (development only)
 *
 * Issues a session for a local account without going through Google, so the app
 * can be explored before OAuth credentials exist. Mounted only when
 * ENABLE_DEV_LOGIN=true and NODE_ENV is not production; the guard below is
 * defence in depth in case it is ever mounted by mistake.
 */
const devLogin = asyncHandler(async (req, res) => {
  if (!env.devLoginEnabled) throw ApiError.notFound('Route not found');

  const adminEmail = env.seed.adminEmail.toLowerCase();
  const email = String(req.body?.email || adminEmail).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw ApiError.badRequest('A valid email is required');

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: email.split('@')[0],
      email,
      // Namespaced so it can never collide with a real Google subject.
      googleId: `dev-login:${email}`,
      role: email === adminEmail ? 'admin' : 'customer',
    });
  }
  if (user.isBlocked) throw ApiError.forbidden('This account has been blocked.');

  user.lastLoginAt = new Date();
  await user.save();

  logger.warn(`DEV LOGIN used for ${email} — ENABLE_DEV_LOGIN must never be set in production`);

  const token = signToken(user);
  setAuthCookie(res, token);
  return res.json({ success: true, token, user: user.toPublicJSON(), devLogin: true });
});

const __setOAuthClient = (stub) => {
  client = stub;
};

module.exports = {
  googleLogin,
  // Exported for testing: the mapping is the user-facing half of a failed login.
  __describeVerificationFailure: describeVerificationFailure,
  devLogin,
  getMe,
  logout,
  updateProfile,
  __setOAuthClient,
  verifyGoogleCredential,
};
