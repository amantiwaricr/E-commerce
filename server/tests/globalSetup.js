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
module.exports = async () => {
  if (process.env.MONGODB_TEST_URI) {
    process.env.TEST_MONGO_URI = process.env.MONGODB_TEST_URI;
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
