'use strict';

const { env, validateEnv } = require('./config/env');
const { connectDB } = require('./config/db');
const createApp = require('./app');
const logger = require('./utils/logger');

const start = async () => {
  validateEnv();
  await connectDB();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`${env.store.name} API listening on port ${env.port} (${env.nodeEnv})`);
    logger.info(`eSewa mode: ${env.esewa.mode}`);
    if (env.devLoginEnabled) {
      logger.warn('DEV LOGIN IS ENABLED — /api/auth/dev-login issues sessions without Google. Local use only.');
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
