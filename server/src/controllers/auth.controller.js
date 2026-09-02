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
    logger.warn('Google credential verification failed:', err.message);
    throw ApiError.unauthorized('Google sign-in failed. Please try again.');
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

const __setOAuthClient = (stub) => {
  client = stub;
};

module.exports = { googleLogin, getMe, logout, updateProfile, __setOAuthClient, verifyGoogleCredential };
