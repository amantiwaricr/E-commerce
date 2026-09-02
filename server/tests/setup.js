'use strict';

// Deterministic configuration for every suite. Set before any module reads env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value-for-suites';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.BACKEND_URL = 'http://localhost:5000';
process.env.ESEWA_MODE = 'sandbox';
process.env.ESEWA_MERCHANT_CODE = 'EPAYTEST';
process.env.ESEWA_SECRET_KEY = '8gBm/:&EnhH.1/q';
process.env.ESEWA_CARD_ENABLED = 'true';
process.env.DELIVERY_CHARGE = '100';
process.env.FREE_DELIVERY_THRESHOLD = '3000';
process.env.WHATSAPP_PROVIDER = 'none';
process.env.SMTP_HOST = '';

jest.setTimeout(60000);
