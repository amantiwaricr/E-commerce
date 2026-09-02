'use strict';

const { env } = require('../config/env');

/** Tiny leveled logger — silent during tests so jest output stays readable. */
const write = (level, args) => {
  if (env.isTest) return;
  const stamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](`[${stamp}] [${level.toUpperCase()}]`, ...args);
};

module.exports = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => env.isProduction || write('debug', args),
};
