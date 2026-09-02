'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');

const { env } = require('./config/env');
const routes = require('./routes');
const sanitizeRequest = require('./middleware/sanitizeRequest');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');

const createApp = () => {
  const app = express();

  // Behind a proxy (Render/Heroku/nginx) so secure cookies and rate limits work.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Images are served cross-origin to the SPA on a different host.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = new Set([env.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin/server-to-server requests arrive without an Origin header.
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(hpp());
  app.use(sanitizeRequest);

  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), { maxAge: '7d' }));

  app.use('/api', apiLimiter, routes);

  app.get('/', (req, res) => res.json({ success: true, message: `${env.store.name} API`, docs: '/api/health' }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
