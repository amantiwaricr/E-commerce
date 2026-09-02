'use strict';

/**
 * Boots a MongoDB instance for the integration suites.
 *
 * Resolution order:
 *   1. `MONGODB_TEST_URI` — an already-running mongod (CI service container, local install).
 *   2. `mongodb-memory-server` — downloads/starts an ephemeral mongod.
 *
 * If neither is reachable (offline machine, restricted network), the DB-backed
 * suites skip themselves instead of failing the whole run. The pure-unit suites
 * always run.
 */
/** Fails fast instead of letting every suite hang on an unreachable database. */
const isReachable = async (uri) => {
  // eslint-disable-next-line global-require
  const mongoose = require('mongoose');
  const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await conn.asPromise();
    return true;
  } catch (err) {
    return false;
  } finally {
    await conn.close().catch(() => {});
  }
};

module.exports = async () => {
  if (process.env.MONGODB_TEST_URI) {
    if (await isReachable(process.env.MONGODB_TEST_URI)) {
      process.env.TEST_MONGO_URI = process.env.MONGODB_TEST_URI;
    } else {
      process.env.TEST_MONGO_URI = '';
      // eslint-disable-next-line no-console
      console.warn(
        [
          '',
          `⚠️  Could not reach MONGODB_TEST_URI (${process.env.MONGODB_TEST_URI}).`,
          '   Database-backed suites (auth, orders, payments) will be SKIPPED.',
          '   Start MongoDB and re-run — e.g. `docker run -d -p 27017:27017 mongo:7`.',
          '',
        ].join('\n')
      );
    }
    return;
  }

  // The downloader is very chatty when the network blocks it; swallow its output
  // and surface one actionable line instead.
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;

  let failure = null;
  try {
    // eslint-disable-next-line global-require
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    globalThis.__MONGOD__ = mongod;
    process.env.TEST_MONGO_URI = mongod.getUri();
  } catch (err) {
    process.env.TEST_MONGO_URI = '';
    failure = err;
  } finally {
    process.stderr.write = stderrWrite;
  }

  if (failure) {
    // eslint-disable-next-line no-console
    console.warn(
      [
        '',
        '⚠️  No MongoDB available — database-backed suites (auth, orders, payments) will be SKIPPED.',
        `   Reason: ${String(failure.message).split('\n')[0]}`,
        '   To run them, start a MongoDB and re-run with:',
        '     MONGODB_TEST_URI=mongodb://127.0.0.1:27017/fmn-test npm test',
        '',
      ].join('\n')
    );
  }
};
