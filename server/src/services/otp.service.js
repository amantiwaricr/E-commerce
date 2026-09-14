'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');

/** A 4-digit code is small, so it is short-lived, attempt-capped and rate-limited. */
const CODE_LENGTH = 4;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const HASH_ROUNDS = 10;

/** Uniformly random, including codes with leading zeros. */
const generateCode = () => String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

const hashCode = (code) => bcrypt.hash(code, HASH_ROUNDS);

const compareCode = (code, hash) => {
  if (!hash || !code) return Promise.resolve(false);
  return bcrypt.compare(code, hash);
};

const expiryFromNow = () => new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

/** Seconds a caller must still wait before another code may be sent. */
const cooldownRemaining = (lastSentAt) => {
  if (!lastSentAt) return 0;
  const elapsed = (Date.now() - new Date(lastSentAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
};

/**
 * Without SMTP there is no way to receive a code, which would make the whole
 * sign-up flow untestable locally. Outside production the code is surfaced
 * instead, and never when real email is configured.
 */
const shouldEchoCode = () => !env.isProduction && !env.mailConfigured;

module.exports = {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  hashCode,
  compareCode,
  expiryFromNow,
  cooldownRemaining,
  shouldEchoCode,
};
