'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('../utils/logger');
const { isObsoleteIndex } = require('../utils/indexes');
const { tlsOptionsFor, isLocalUri } = require('../utils/mongoTls');

mongoose.set('strictQuery', true);

/**
 * Removes indexes left behind by fields the schema has dropped. Without this a
 * stale unique index keeps rejecting new documents — and nothing in the code
 * explains why, because the field no longer exists anywhere.
 */
const dropObsoleteIndexes = async () => {
  for (const model of Object.values(mongoose.models)) {
    let existing = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      existing = await model.collection.indexes();
    } catch (err) {
      continue; // Collection not created yet — nothing to clean up.
    }

    for (const index of existing) {
      if (!isObsoleteIndex(model.schema, index)) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await model.collection.dropIndex(index.name);
        logger.warn(`Dropped obsolete index ${model.modelName}.${index.name} — its fields are no longer in the schema`);
      } catch (err) {
        logger.error(`Could not drop obsolete index ${model.modelName}.${index.name}: ${err.message}`);
      }
    }
  }
};

const connectDB = async (uri = env.mongoUri) => {
  const tls = tlsOptionsFor(uri);
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    ...tls,
  });
  logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  if (tls.tls) logger.info('MongoDB connection secured with TLS');
  if (env.isProduction && isLocalUri(uri)) {
    logger.warn('MONGODB_URI points at localhost in production — is that intended?');
  }

  await dropObsoleteIndexes().catch((err) => logger.error(`Index cleanup failed: ${err.message}`));

  return conn;
};

const disconnectDB = async () => {
  await mongoose.connection.close();
};

module.exports = { connectDB, disconnectDB, dropObsoleteIndexes };
