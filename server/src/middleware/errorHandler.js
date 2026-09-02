'use strict';

const mongoose = require('mongoose');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** Translates framework/driver errors into a consistent JSON error envelope. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed', details);
  } else if (error instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for "${error.path}"`);
  } else if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || { field: 1 })[0];
    error = ApiError.conflict(`A record with that ${field} already exists`);
  } else if (!(error instanceof ApiError)) {
    error = new ApiError(error.statusCode || 500, error.message || 'Something went wrong');
    error.isOperational = false;
  }

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    message: error.statusCode >= 500 && env.isProduction ? 'Something went wrong' : error.message,
  };
  if (error.details) body.errors = error.details;
  if (!env.isProduction && error.statusCode >= 500) body.stack = err.stack;

  return res.status(error.statusCode || 500).json(body);
};

module.exports = errorHandler;
