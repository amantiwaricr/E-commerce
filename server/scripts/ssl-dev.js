#!/usr/bin/env node
'use strict';

/**
 * Generates a self-signed certificate for local HTTPS.
 *
 *   npm run ssl:dev
 *
 * The certificate is for development only — browsers will warn, because
 * nothing vouches for it. Its point is that you can run the API over TLS on
 * your own machine and so test the things that only happen over HTTPS: secure
 * cookies, the HTTP→HTTPS redirect, and SameSite=None flows.
 *
 * Never deploy these files. Production certificates come from a CA — Let's
 * Encrypt is free and automatic.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../certs');
const keyPath = path.join(dir, 'dev-key.pem');
const certPath = path.join(dir, 'dev-cert.pem');
const DAYS = 365;

const run = () => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch (err) {
    console.error('openssl was not found on your PATH.');
    console.error('  Windows: it ships with Git for Windows — try "Git Bash".');
    console.error('  macOS:   brew install openssl');
    console.error('  Linux:   apt install openssl');
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

  // SANs matter: modern browsers ignore the legacy Common Name entirely.
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath,
      '-out', certPath,
      '-days', String(DAYS),
      '-subj', '/C=NP/ST=Bagmati/L=Lalitpur/O=Fresh Meat Nepal/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:::1',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  console.log('Development certificate written:');
  console.log(`  key  ${keyPath}`);
  console.log(`  cert ${certPath}`);
  console.log(`\nValid for ${DAYS} days. Add to server/.env to use it:\n`);
  console.log('  SSL_KEY_PATH=./certs/dev-key.pem');
  console.log('  SSL_CERT_PATH=./certs/dev-cert.pem');
  console.log('  BACKEND_URL=https://localhost:5000');
  console.log('  COOKIE_SECURE=true');
  console.log('\nThen point the apps at https://localhost:5000/api and accept the browser warning once.');
};

run();
