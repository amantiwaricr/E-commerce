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

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // The value in `.env.example` is a placeholder — accepting it would send an
  // unusable client ID to Google and surface as a confusing 401 in the browser.
  googleConfigured:
    (process.env.GOOGLE_CLIENT_ID || '').endsWith('.apps.googleusercontent.com') &&
    !(process.env.GOOGLE_CLIENT_ID || '').startsWith('your-'),
  // Local-only escape hatch: lets you use the app before Google OAuth is set up.
  // Requires an explicit opt-in AND a non-production NODE_ENV — the route is not
  // even mounted otherwise, so it cannot be reached on a deployed instance.
  devLoginEnabled: !isProduction && bool(process.env.ENABLE_DEV_LOGIN, false),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookie: {
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    secure: bool(process.env.COOKIE_SECURE, isProduction),
    domain: process.env.COOKIE_DOMAIN || undefined,
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
  if (!env.googleConfigured) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (missing.length) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
};

module.exports = { env, validateEnv, bool, num };
