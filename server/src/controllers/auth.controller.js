'use strict';

const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { SCOPES, signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const otp = require('../services/otp.service');
const templates = require('../services/templates');
const { sendMail } = require('../services/email.service');

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

/**
 * Each app serves one kind of account and they never mix: administrators sign
 * in at the admin panel, everyone else at the shop. Returns the refusal message,
 * or null when the pairing is allowed.
 *
 * Callers must check the password first, so that a refusal here cannot tell a
 * stranger which addresses are administrators.
 */
const scopeRefusal = (role, scope) => {
  if (scope === SCOPES.ADMIN && role !== 'admin') {
    return 'This account does not have admin access. Please sign in at the shop instead.';
  }
  if (scope === SCOPES.STOREFRONT && role === 'admin') {
    return 'Admin accounts sign in through the admin panel, not the shop.';
  }
  return null;
};

/**
 * Issues a fresh code, stores only its hash, and emails it.
 *
 * Returns the code itself only when there is no SMTP transport and this is not
 * production — otherwise local development could never complete a sign-up.
 */
const issueVerificationCode = async (user) => {
  const code = otp.generateCode();

  user.emailVerification = {
    codeHash: await otp.hashCode(code),
    expiresAt: otp.expiryFromNow(),
    attempts: 0,
    lastSentAt: new Date(),
  };
  await user.save();

  const mail = templates.verificationEmail({
    name: user.name,
    code,
    ttlMinutes: otp.CODE_TTL_MINUTES,
  });

  const result = await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });

  if (result.sent) return { code: null, emailed: true, reason: '' };

  // The email did not reach them. Say why, loudly, rather than failing quietly.
  const reason = result.error || result.reason || 'the email could not be sent';
  logger.error(`Verification code for ${user.email} was NOT delivered: ${reason}`);

  if (otp.canRevealCode({ delivered: false })) {
    logger.warn(`Verification code for ${user.email} is ${code} — shown because the email did not go out`);
    return { code, emailed: false, reason };
  }

  return { code: null, emailed: false, reason };
};

/**
 * POST /api/auth/register
 * Creates an unverified account and sends a code. No session is issued until
 * the address has been proven.
 */
const register = asyncHandler(async (req, res) => {
  const email = normaliseEmail(req.body.email);
  const { name, password } = req.body;

  const existing = await User.findOne({ email });

  if (existing?.isEmailVerified) {
    throw ApiError.conflict('An account with that email already exists. Please sign in instead.');
  }

  // An unverified account may be claimed again — someone who never received
  // their code can simply sign up a second time.
  // Built field by field, never from the request body: a `role` in the payload
  // must not be able to create an administrator.
  const user = existing || new User({ name: name.trim(), email, role: 'customer' });
  user.name = name.trim();
  await user.setPassword(password);
  await user.save();

  const { code, emailed, reason } = await issueVerificationCode(user);

  return res.status(201).json({
    success: true,
    email: user.email,
    message: emailed
      ? `We sent a ${otp.CODE_LENGTH}-digit code to ${user.email}. Enter it to finish creating your account.`
      : `Enter the ${otp.CODE_LENGTH}-digit code to finish creating your account.`,
    emailed,
    // Both are present only outside production, when the email did not go out.
    ...(code ? { devCode: code } : {}),
    ...(!emailed && !env.isProduction && reason ? { mailError: reason } : {}),
  });
});

/**
 * POST /api/auth/verify-email
 * Checks the code and, on success, verifies the address and signs the user in.
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const email = normaliseEmail(req.body.email);
  const code = String(req.body.code || '').trim();

  const user = await User.findOne({ email }).select(
    '+emailVerification.codeHash +emailVerification.expiresAt +emailVerification.attempts +emailVerification.lastSentAt'
  );
  if (!user) throw ApiError.badRequest('That code is not valid. Please request a new one.');
  if (user.isBlocked) throw ApiError.forbidden('This account has been blocked. Contact support.');

  if (user.isEmailVerified) {
    // Nothing to do, but do not strand someone who submitted twice. An admin
    // account must not pick up a storefront session by this route either.
    const refusal = scopeRefusal(user.role, SCOPES.STOREFRONT);
    if (refusal) throw ApiError.forbidden(refusal);
    const token = signToken(user, SCOPES.STOREFRONT);
    setAuthCookie(res, token, SCOPES.STOREFRONT);
    return res.json({ success: true, alreadyVerified: true, token, user: user.toPublicJSON() });
  }

  const record = user.emailVerification || {};
  if (!record.codeHash) throw ApiError.badRequest('No code is pending for this account. Please request a new one.');

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('That code has expired. Please request a new one.');
  }

  if ((record.attempts || 0) >= otp.MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  const matches = await otp.compareCode(code, record.codeHash);
  if (!matches) {
    user.emailVerification.attempts = (record.attempts || 0) + 1;
    await user.save();

    const left = otp.MAX_ATTEMPTS - user.emailVerification.attempts;
    throw ApiError.badRequest(
      left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'That code is not correct. Please request a new code.'
    );
  }

  user.isEmailVerified = true;
  // The code is single-use: clear it so it can never be replayed.
  user.emailVerification = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  setAuthCookie(res, token);

  logger.info(`Email verified and account activated: ${user.email}`);
  return res.json({ success: true, token, user: user.toPublicJSON() });
});

/** POST /api/auth/resend-code — throttled re-send for an unverified account. */
const resendCode = asyncHandler(async (req, res) => {
  const email = normaliseEmail(req.body.email);

  const user = await User.findOne({ email }).select('+emailVerification.lastSentAt');
  if (!user || user.isEmailVerified) {
    // Do not confirm whether the address is registered.
    return res.json({ success: true, message: 'If that account needs verifying, a new code is on its way.' });
  }

  const wait = otp.cooldownRemaining(user.emailVerification?.lastSentAt);
  if (wait > 0) {
    throw new ApiError(429, `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`);
  }

  const { code, emailed, reason } = await issueVerificationCode(user);

  return res.json({
    success: true,
    message: emailed ? `A new code is on its way to ${user.email}.` : 'A new code has been issued.',
    emailed,
    ...(code ? { devCode: code } : {}),
    ...(!emailed && !env.isProduction && reason ? { mailError: reason } : {}),
  });
});

/**
 * POST /api/auth/login
 *
 * `scope` says which app is asking. The admin panel sends `admin` and only an
 * administrator may use it; the storefront sends nothing and always receives a
 * customer-level session, even for a staff account.
 */
const login = asyncHandler(async (req, res) => {
  const email = normaliseEmail(req.body.email);
  const { password } = req.body;
  const scope = req.body.scope === SCOPES.ADMIN ? SCOPES.ADMIN : SCOPES.STOREFRONT;

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = user ? await user.verifyPassword(password) : false;

  // One message for both cases, so the response cannot be used to discover
  // which addresses are registered.
  if (!user || !passwordOk) throw ApiError.unauthorized('Invalid email or password.');
  if (user.isBlocked) throw ApiError.forbidden('This account has been blocked. Contact support.');

  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Please verify your email address before signing in.', [
      { field: 'email', message: 'unverified' },
    ]);
  }

  const refusal = scopeRefusal(user.role, scope);
  if (refusal) throw ApiError.forbidden(refusal);

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user, scope);
  setAuthCookie(res, token, scope);

  return res.json({ success: true, token, scope, user: user.toPublicJSON() });
});

/** GET /api/auth/me */
const getMe = asyncHandler(async (req, res) => res.json({ success: true, user: req.user.toPublicJSON() }));

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

/** POST /api/auth/change-password — requires the current password. */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is not correct.');
  }

  await user.setPassword(newPassword);
  await user.save();

  return res.json({ success: true, message: 'Password updated.' });
});

module.exports = {
  register,
  // Exported for testing: the rule that keeps the two apps apart.
  __scopeRefusal: scopeRefusal,
  verifyEmail,
  resendCode,
  login,
  getMe,
  logout,
  updateProfile,
  changePassword,
};
