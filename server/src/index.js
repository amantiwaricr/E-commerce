'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { env, validateEnv } = require('./config/env');
const { connectDB } = require('./config/db');
const createApp = require('./app');
const logger = require('./utils/logger');

/**
 * Serves TLS from Node when a key and certificate are configured, and plain
 * HTTP otherwise. Most deployments terminate TLS at a proxy and want the
 * latter; the former exists so `COOKIE_SECURE=true` and the HTTPS redirect can
 * be exercised locally rather than discovered in production.
 */
const createServer = (app) => {
  const { keyPath, certPath, minVersion } = env.https;
  if (!keyPath || !certPath) return http.createServer(app);

  // Resolved against the server package, not the working directory: `npm run
  // dev` from the repo root would otherwise look in the wrong place.
  const serverRoot = path.resolve(__dirname, '..');
  const resolve = (file) => (path.isAbsolute(file) ? file : path.resolve(serverRoot, file));

  const files = {};
  for (const [label, file] of [['SSL_KEY_PATH', keyPath], ['SSL_CERT_PATH', certPath]]) {
    const full = resolve(file);
    if (!fs.existsSync(full)) {
      throw new Error(`${label} points at ${full}, which does not exist. Run: npm run ssl:dev`);
    }
    files[label] = full;
  }

  return https.createServer(
    {
      key: fs.readFileSync(files.SSL_KEY_PATH),
      cert: fs.readFileSync(files.SSL_CERT_PATH),
      minVersion,
    },
    app
  );
};

const start = async () => {
  validateEnv();
  await connectDB();

  const app = createApp();
  const server = createServer(app);

  server.listen(env.port, () => {
    const scheme = server instanceof https.Server ? 'https' : 'http';
    logger.info(`${env.store.name} API listening on ${scheme}://localhost:${env.port} (${env.nodeEnv})`);
    logger.info(`eSewa mode: ${env.esewa.mode}`);
    if (scheme === 'http' && env.isProduction && !env.https.enforce) {
      logger.warn('Serving plain HTTP in production with FORCE_HTTPS off — terminate TLS in front of this process.');
    }
  });

  const shutdown = (signal) => () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
  });
};

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
