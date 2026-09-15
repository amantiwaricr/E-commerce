'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Tests configure themselves in tests/setup.js and must stay hermetic: reading a
// developer's local .env here would make results depend on their machine.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * True only for a value a human actually filled in. `.env.example` ships
 * readable placeholders like `your-16-char-app-password`, and treating those as
 * real makes a service look configured when it cannot possibly work.
 */
const PLACEHOLDER_PATTERNS = [
  /^your[-._]/, // your-gmail-address@…, your.personal@…
  /^the[-_]/, // the-16-char-app-password
  /^change[-_]?me/,
  /^</, // <paste-here>
  /^(xxx+|placeholder|example|todo|tbd|dummy)$/,
  /@example\.(com|org|net)$/,
  /\bapp[-_]password\b/,
  /\d+[-_]char\b/, // 16-char-…
];

const isPlaceholder = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
};

const configured = (...values) => values.every((value) => !isPlaceholder(value));

const nodeEnv = process.env.NODE_ENV || 'development';
const esewaMode = (process.env.ESEWA_MODE || 'sandbox').toLowerCase();
const isProduction = nodeEnv === 'production';

const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: num(process.env.PORT, 5000),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  backendUrl: (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, ''),
  // The admin panel is a separate app served from its own origin.
  adminUrl: (process.env.ADMIN_URL || 'http://localhost:5174').replace(/\/$/, ''),

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fresh-meat-nepal',

  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookie: {
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    secure: bool(process.env.COOKIE_SECURE, isProduction),
    domain: process.env.COOKIE_DOMAIN || undefined,
  },

  https: {
    /* Redirect plain HTTP to HTTPS and send HSTS. On by default in production;
       turn it off only if something in front already does it. */
    enforce: bool(process.env.FORCE_HTTPS, isProduction),
    hstsMaxAge: num(process.env.HSTS_MAX_AGE, 31536000), // one year
    hstsIncludeSubDomains: bool(process.env.HSTS_INCLUDE_SUBDOMAINS, true),
    /* Off by default: preloading is effectively irreversible, so it has to be
       a deliberate choice once every subdomain is known to serve TLS. */
    hstsPreload: bool(process.env.HSTS_PRELOAD, false),
    /* Serve TLS from Node itself — for local development, or a deployment
       with no proxy in front. Both paths must be set for it to engage. */
    keyPath: process.env.SSL_KEY_PATH || '',
    certPath: process.env.SSL_CERT_PATH || '',
    /* TLS 1.2 is the floor for PCI DSS; 1.0 and 1.1 are deprecated. */
    minVersion: process.env.TLS_MIN_VERSION || 'TLSv1.2',
  },

  esewa: {
    mode: esewaMode,
    isSandbox: esewaMode !== 'production',
    merchantCode: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST',
    secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
    cardEnabled: bool(process.env.ESEWA_CARD_ENABLED, true),
    formUrl:
      esewaMode === 'production'
        ? process.env.ESEWA_PRODUCTION_FORM_URL || 'https://epay.esewa.com.np/api/epay/main/v2/form'
        : process.env.ESEWA_SANDBOX_FORM_URL || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    statusUrl:
      esewaMode === 'production'
        ? process.env.ESEWA_PRODUCTION_STATUS_URL || 'https://epay.esewa.com.np/api/epay/transaction/status/'
        : process.env.ESEWA_SANDBOX_STATUS_URL || 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.MAIL_FROM_NAME || 'Fresh Meat Nepal',
    fromAddress: process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || '',
  },

  // True only when a real SMTP transport can be built.
  mailConfigured: configured(process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASSWORD),

  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase(),
    meta: {
      token: process.env.META_WHATSAPP_TOKEN || '',
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
      templateName: process.env.META_WHATSAPP_TEMPLATE_NAME || 'order_confirmation',
      templateLang: process.env.META_WHATSAPP_TEMPLATE_LANG || 'en',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_WHATSAPP_FROM || '',
    },
  },

  store: {
    name: process.env.STORE_NAME || 'Fresh Meat Nepal',
    supportPhone: process.env.STORE_SUPPORT_PHONE || '+977-9800000000',
    deliveryCharge: num(process.env.DELIVERY_CHARGE, 100),
    freeDeliveryThreshold: num(process.env.FREE_DELIVERY_THRESHOLD, 3000),
    deliveryEta: process.env.DEFAULT_DELIVERY_ETA || 'Within 24 hours inside Kathmandu Valley',
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@freshmeatnepal.com',
    adminName: process.env.SEED_ADMIN_NAME || 'Store Admin',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  },
};

/**
 * Fail fast in production when a required secret is missing, so the server never
 * boots with an insecure fallback.
 */
const validateEnv = () => {
  if (!env.isProduction) return;
  const missing = [];
  if (!env.jwtSecret || env.jwtSecret === 'dev-only-insecure-secret') missing.push('JWT_SECRET');
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (missing.length) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
};

module.exports = { env, validateEnv, bool, num, isPlaceholder, configured };
