'use strict';

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const build = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message },
  });

module.exports = {
  apiLimiter: build(15 * 60 * 1000, 600, 'Too many requests, please try again in a few minutes'),
  authLimiter: build(15 * 60 * 1000, 30, 'Too many sign-in attempts, please try again later'),
  writeLimiter: build(60 * 1000, 40, 'You are doing that too often, please slow down'),
  // A 4-digit code is only 10,000 values: cap guesses hard at the edge as well
  // as per-account, so an attacker cannot spread attempts across accounts.
  otpLimiter: build(15 * 60 * 1000, 20, 'Too many verification attempts, please try again later'),
  /* Settling a payment costs a signature check and a call out to eSewa. The
     signature makes forgery pointless, but nothing stops someone replaying
     junk to burn our CPU and our quota at the gateway, so the door is narrow.
     Genuine traffic uses this once or twice per order. */
  paymentLimiter: build(15 * 60 * 1000, 30, 'Too many payment attempts, please try again in a few minutes'),
  /* Placing an order moves stock. One a minute is generous for a person and
     ruinous for a script. */
  checkoutLimiter: build(60 * 1000, 10, 'Too many orders placed, please wait a moment'),
};
