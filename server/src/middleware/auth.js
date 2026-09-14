'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * A session belongs to one app. The storefront can only ever issue a
 * `storefront` session, and the admin API accepts nothing else but `admin` —
 * so signing in on the shop grants no administrative access even to a staff
 * account, and a leaked shop token is useless against the admin API.
 */
const SCOPES = { STOREFRONT: 'storefront', ADMIN: 'admin' };

// Browser cookies ignore the port, so :5173 and :5174 would otherwise share
// one. Separate names keep each app's session to itself.
const COOKIE_NAMES = { [SCOPES.STOREFRONT]: 'fmn_token', [SCOPES.ADMIN]: 'fmn_admin_token' };

const ACCESS_TOKEN_COOKIE = COOKIE_NAMES[SCOPES.STOREFRONT];

const signToken = (user, scope = SCOPES.STOREFRONT) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, scope }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const readToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  // Either cookie is accepted: the scope inside the token is what decides.
  return req.cookies?.[COOKIE_NAMES[SCOPES.ADMIN]] || req.cookies?.[COOKIE_NAMES[SCOPES.STOREFRONT]] || null;
};

/** Requires a valid session; attaches the user and the session's scope. */
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
  // Tokens issued before scopes existed are treated as storefront sessions.
  req.tokenScope = payload.scope || SCOPES.STOREFRONT;
  return next();
});

/** Attaches `req.user` when a valid token is present, but never rejects. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (user && !user.isBlocked) {
      req.user = user;
      req.tokenScope = payload.scope || SCOPES.STOREFRONT;
    }
  } catch (err) {
    // Ignore invalid tokens on optional routes.
  }
  return next();
});

/**
 * Admin-only guard. Requires both the role and an admin-scoped session, so a
 * storefront sign-in never reaches the admin API. Must run after `requireAuth`.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'admin') return next(ApiError.forbidden('Admin access required'));
  if (req.tokenScope !== SCOPES.ADMIN) {
    return next(ApiError.forbidden('Sign in through the admin panel to manage the store'));
  }
  return next();
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: env.cookie.sameSite,
  secure: env.cookie.secure,
  domain: env.cookie.domain,
  path: '/',
});

const setAuthCookie = (res, token, scope = SCOPES.STOREFRONT) => {
  res.cookie(COOKIE_NAMES[scope] || ACCESS_TOKEN_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/** Clears both cookies: signing out should never leave the other app's behind. */
const clearAuthCookie = (res) => {
  Object.values(COOKIE_NAMES).forEach((name) => res.clearCookie(name, cookieOptions()));
};

module.exports = {
  SCOPES,
  COOKIE_NAMES,
  ACCESS_TOKEN_COOKIE,
  signToken,
  requireAuth,
  optionalAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};
