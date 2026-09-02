'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ACCESS_TOKEN_COOKIE = 'fmn_token';

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[ACCESS_TOKEN_COOKIE] || null;
};

/** Requires a valid session; attaches the user document to `req.user`. */
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized('You must be signed in to continue');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.isBlocked) throw ApiError.forbidden('This account has been blocked. Contact support.');

  req.user = user;
  return next();
});

/** Attaches `req.user` when a valid token is present, but never rejects. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (user && !user.isBlocked) req.user = user;
  } catch (err) {
    // Ignore invalid tokens on optional routes.
  }
  return next();
});

/** Route guard for admin-only endpoints. Must run after `requireAuth`. */
const requireAdmin = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'admin') return next(ApiError.forbidden('Admin access required'));
  return next();
};

const setAuthCookie = (res, token) => {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: env.cookie.sameSite,
    secure: env.cookie.secure,
    domain: env.cookie.domain,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: env.cookie.sameSite,
    secure: env.cookie.secure,
    domain: env.cookie.domain,
    path: '/',
  });
};

module.exports = {
  ACCESS_TOKEN_COOKIE,
  signToken,
  requireAuth,
  optionalAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};
