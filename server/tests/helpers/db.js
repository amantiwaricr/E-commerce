'use strict';

const mongoose = require('mongoose');

const uri = () => process.env.TEST_MONGO_URI || '';

/** True when globalSetup managed to provide a MongoDB instance. */
const hasDatabase = () => Boolean(uri());

/**
 * `describe` when a database is available, `describe.skip` otherwise — lets the
 * suite run end-to-end on a developer machine and stay green without MongoDB.
 */
const describeWithDb = hasDatabase() ? describe : describe.skip;

const connect = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri(), { serverSelectionTimeoutMS: 10000 });
  }
};

const clear = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

const disconnect = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.connection.close();
  }
};

module.exports = { hasDatabase, describeWithDb, connect, clear, disconnect };
