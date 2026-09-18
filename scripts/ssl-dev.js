#!/usr/bin/env node
'use strict';

/**
 * Turns local HTTPS on (or off) for all three apps in one command.
 *
 *   npm run ssl:dev        generate a certificate and switch everything to https
 *   npm run ssl:dev -- off switch back to plain http
 *
 * The certificate is self-signed, so browsers warn about it — nothing vouches
 * for it. Its purpose is that the site, the admin panel and the API all speak
 * TLS on your own machine, which is the only way to exercise `secure` cookies,
 * the HTTP→HTTPS redirect and `SameSite=None` before production rather than
 * after. Production certificates come from a CA; Let's Encrypt is free.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { setValues } = require('./env-file');

const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'server', 'certs');
const KEY = path.join(CERT_DIR, 'dev-key.pem');
const CERT = path.join(CERT_DIR, 'dev-cert.pem');
const DAYS = 365;

const ENVS = {
  server: path.join(ROOT, 'server', '.env'),
  client: path.join(ROOT, 'client', '.env'),
  admin: path.join(ROOT, 'admin', '.env'),
};

const API = (scheme) => `${scheme}://localhost:5000`;
const SITE = (scheme) => `${scheme}://localhost:5173`;
const ADMIN = (scheme) => `${scheme}://localhost:5174`;

const missingEnvs = () => Object.entries(ENVS).filter(([, file]) => !fs.existsSync(file)).map(([name]) => name);

const ensureOpenssl = () => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch (err) {
    console.error('\nopenssl was not found on your PATH.');
    console.error('  Windows: it ships with Git for Windows — run this from "Git Bash".');
    console.error('  macOS:   brew install openssl');
    console.error('  Linux:   apt install openssl\n');
    process.exit(1);
  }
};

const generate = () => {
  if (fs.existsSync(KEY) && fs.existsSync(CERT)) {
    console.log('✓ certificate already present in server/certs');
    return;
  }
  ensureOpenssl();
  fs.mkdirSync(CERT_DIR, { recursive: true });

  // SANs matter: modern browsers ignore the legacy Common Name entirely.
  try {
    // openssl writes its key-generation progress to stderr; swallow it, and
    // only show the output if the command actually fails.
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', KEY, '-out', CERT, '-days', String(DAYS),
        '-subj', '/C=NP/ST=Bagmati/L=Lalitpur/O=Fresh Meat Nepal/CN=localhost',
        '-addext', 'subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:::1',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
  } catch (err) {
    console.error('\nopenssl could not create the certificate:\n');
    console.error(String(err.stderr || err.message));
    process.exit(1);
  }
  console.log(`✓ generated a self-signed certificate, valid ${DAYS} days`);
};

/** Cert paths are written relative to each app, so the repo stays movable. */
const relative = (from, file) => `./${path.relative(from, file).split(path.sep).join('/')}`;

const turnOn = () => {
  generate();

  const changed = {
    server: setValues(ENVS.server, {
      SSL_KEY_PATH: relative(path.dirname(ENVS.server), KEY),
      SSL_CERT_PATH: relative(path.dirname(ENVS.server), CERT),
      BACKEND_URL: API('https'),
      FRONTEND_URL: SITE('https'),
      ADMIN_URL: ADMIN('https'),
      SITE_URL: SITE('https'),
      COOKIE_SECURE: 'true',
    }),
    client: setValues(ENVS.client, {
      SSL_KEY_PATH: relative(path.dirname(ENVS.client), KEY),
      SSL_CERT_PATH: relative(path.dirname(ENVS.client), CERT),
      VITE_API_URL: `${API('https')}/api`,
      VITE_SITE_URL: SITE('https'),
    }),
    admin: setValues(ENVS.admin, {
      SSL_KEY_PATH: relative(path.dirname(ENVS.admin), KEY),
      SSL_CERT_PATH: relative(path.dirname(ENVS.admin), CERT),
      VITE_API_URL: `${API('https')}/api`,
      VITE_STOREFRONT_URL: SITE('https'),
    }),
  };

  Object.entries(changed).forEach(([app, keys]) => {
    console.log(keys.length ? `✓ ${app}/.env: set ${keys.join(', ')}` : `· ${app}/.env: already set`);
  });

  console.log('\nHTTPS is on. Restart `npm run dev`, then open:');
  console.log(`  storefront  ${SITE('https')}`);
  console.log(`  admin       ${ADMIN('https')}`);
  console.log(`  API         ${API('https')}/api/health`);
  console.log('\nYour browser will warn about the certificate the first time — that is expected');
  console.log('for a self-signed one. Accept it once per port (5173, 5174 and 5000).');
  console.log('\nTo go back:  npm run ssl:dev -- off\n');
};

const turnOff = () => {
  setValues(ENVS.server, {
    SSL_KEY_PATH: '', SSL_CERT_PATH: '',
    BACKEND_URL: API('http'), FRONTEND_URL: SITE('http'), ADMIN_URL: ADMIN('http'),
    SITE_URL: SITE('http'), COOKIE_SECURE: 'false',
  });
  setValues(ENVS.client, {
    SSL_KEY_PATH: '', SSL_CERT_PATH: '',
    VITE_API_URL: `${API('http')}/api`, VITE_SITE_URL: SITE('http'),
  });
  setValues(ENVS.admin, {
    SSL_KEY_PATH: '', SSL_CERT_PATH: '',
    VITE_API_URL: `${API('http')}/api`, VITE_STOREFRONT_URL: SITE('http'),
  });

  console.log('✓ HTTPS off — all three apps are back on http. Restart `npm run dev`.');
  console.log('  The certificate is left in server/certs; delete it to start fresh.\n');
};

const main = () => {
  const off = process.argv.slice(2).some((arg) => /^(--)?off$/.test(arg));

  const missing = missingEnvs();
  if (missing.length) {
    console.error(`\nMissing ${missing.map((m) => `${m}/.env`).join(', ')}. Run \`npm run setup\` first.\n`);
    process.exit(1);
  }

  console.log('\nFresh Meat Nepal — local HTTPS\n');
  return off ? turnOff() : turnOn();
};

main();
