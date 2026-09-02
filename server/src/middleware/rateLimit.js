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
};
