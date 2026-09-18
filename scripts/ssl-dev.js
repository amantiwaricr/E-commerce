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
 *
 * The certificate is made in Node, not by shelling out to `openssl`. openssl is
 * not on PATH in PowerShell or the Windows command prompt, and telling someone
 * to go and install a C toolchain to see a padlock on their own laptop is not a
 * setup step — it is a dead end.
 */

const fs = require('fs');
const path = require('path');

const { readEnvFile, setValues } = require('./env-file');

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

const missingEnvs = () => Object.entries(ENVS).filter(([, file]) => !fs.existsSync(file)).map(([name]) => name);

const valuesIn = (file) => (readEnvFile(file) || { values: {} }).values;

/**
 * Builds an `<scheme>://<host>:<port>` function from whatever is already
 * configured, so only the scheme changes. Hardcoding localhost:5000 here was a
 * real bug: an API on any other port got https:// URLs pointing at nothing.
 *
 * @param existing  a URL already in a .env, used for its host and port
 * @param fallback  the port to assume when there is nothing to read
 * @param override  a port that outranks the URL's own (the API's PORT does)
 */
const originFrom = (existing, fallback, override) => {
  let host = 'localhost';
  let port = String(override || fallback);

  try {
    const url = new URL(existing);
    host = url.hostname;
    if (!override) port = url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch {
    // Absent or malformed — the defaults above stand.
  }

  const authority = port === '80' || port === '443' ? host : `${host}:${port}`;
  return (scheme) => `${scheme}://${authority}`;
};

/** Where each app lives, read from the .env files rather than assumed. */
const readOrigins = () => {
  const server = valuesIn(ENVS.server);
  const client = valuesIn(ENVS.client);

  return {
    // PORT is what the API actually listens on, so it outranks a stale BACKEND_URL.
    api: originFrom(server.BACKEND_URL || client.VITE_API_URL, 5000, server.PORT),
    site: originFrom(server.FRONTEND_URL || client.VITE_SITE_URL, 5173),
    admin: originFrom(server.ADMIN_URL, 5174),
  };
};

const loadSelfsigned = () => {
  try {
    return require('selfsigned');
  } catch {
    console.error('\nThe `selfsigned` package is missing — it makes the certificate.');
    console.error('  Run `npm install` in the project root, then try again.\n');
    return process.exit(1);
  }
};

const generate = async () => {
  if (fs.existsSync(KEY) && fs.existsSync(CERT)) {
    console.log('✓ certificate already present in server/certs');
    return;
  }

  const selfsigned = loadSelfsigned();
  fs.mkdirSync(CERT_DIR, { recursive: true });

  let pems;
  try {
    pems = await selfsigned.generate(
      [
        { name: 'commonName', value: 'localhost' },
        { name: 'organizationName', value: 'Fresh Meat Nepal' },
        { name: 'countryName', value: 'NP' },
        { name: 'localityName', value: 'Lalitpur' },
      ],
      {
        days: DAYS,
        keySize: 2048,
        algorithm: 'sha256',
        // SANs matter: modern browsers ignore the legacy Common Name entirely.
        extensions: [
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' },
              { type: 7, ip: '127.0.0.1' },
              { type: 7, ip: '::1' },
            ],
          },
        ],
      }
    );
  } catch (err) {
    console.error('\nThe certificate could not be created:\n');
    console.error(`  ${err.message}\n`);
    return process.exit(1);
  }

  // 0o600: the private key is readable by this account only. It never leaves
  // the machine, but a key with default permissions is a habit worth not having.
  fs.writeFileSync(KEY, pems.private, { mode: 0o600 });
  fs.writeFileSync(CERT, pems.cert);
  console.log(`✓ generated a self-signed certificate, valid ${DAYS} days`);
};

/** Cert paths are written relative to each app, so the repo stays movable. */
const relative = (from, file) => {
  const rel = path.relative(from, file).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const apply = (scheme, { api, site, admin }) => ({
  server: setValues(ENVS.server, {
    SSL_KEY_PATH: scheme === 'https' ? relative(path.dirname(ENVS.server), KEY) : '',
    SSL_CERT_PATH: scheme === 'https' ? relative(path.dirname(ENVS.server), CERT) : '',
    BACKEND_URL: api(scheme),
    FRONTEND_URL: site(scheme),
    ADMIN_URL: admin(scheme),
    SITE_URL: site(scheme),
    COOKIE_SECURE: scheme === 'https' ? 'true' : 'false',
  }),
  client: setValues(ENVS.client, {
    SSL_KEY_PATH: scheme === 'https' ? relative(path.dirname(ENVS.client), KEY) : '',
    SSL_CERT_PATH: scheme === 'https' ? relative(path.dirname(ENVS.client), CERT) : '',
    VITE_API_URL: `${api(scheme)}/api`,
    VITE_SITE_URL: site(scheme),
  }),
  admin: setValues(ENVS.admin, {
    SSL_KEY_PATH: scheme === 'https' ? relative(path.dirname(ENVS.admin), KEY) : '',
    SSL_CERT_PATH: scheme === 'https' ? relative(path.dirname(ENVS.admin), CERT) : '',
    VITE_API_URL: `${api(scheme)}/api`,
    VITE_STOREFRONT_URL: site(scheme),
  }),
});

const report = (changed) => {
  Object.entries(changed).forEach(([app, keys]) => {
    console.log(keys.length ? `✓ ${app}/.env: set ${keys.join(', ')}` : `· ${app}/.env: already set`);
  });
};

const portOf = (url) => new URL(url).port || '443';

const turnOn = async (origins) => {
  await generate();
  report(apply('https', origins));

  console.log('\nHTTPS is on. Restart `npm run dev`, then open:');
  console.log(`  storefront  ${origins.site('https')}`);
  console.log(`  admin       ${origins.admin('https')}`);
  console.log(`  API         ${origins.api('https')}/api/health`);

  const ports = [origins.site, origins.admin, origins.api].map((o) => portOf(o('https')));
  console.log('\nYour browser will warn about the certificate the first time — that is expected');
  console.log(`for a self-signed one. Accept it once per port (${ports.join(', ')}).`);
  console.log('\nTo go back:  npm run ssl:dev -- off\n');
};

const turnOff = (origins) => {
  report(apply('http', origins));
  console.log('\n✓ HTTPS off — all three apps are back on http. Restart `npm run dev`.');
  console.log('  The certificate is left in server/certs; delete it to start fresh.\n');
};

const main = async () => {
  const off = process.argv.slice(2).some((arg) => /^(--)?off$/.test(arg));

  const missing = missingEnvs();
  if (missing.length) {
    console.error(`\nMissing ${missing.map((m) => `${m}/.env`).join(', ')}. Run \`npm run setup\` first.\n`);
    return process.exit(1);
  }

  console.log('\nFresh Meat Nepal — local HTTPS\n');

  // Read the ports before anything is rewritten: turning HTTPS off has to find
  // the same host and port that turning it on wrote.
  const origins = readOrigins();
  return off ? turnOff(origins) : turnOn(origins);
};

main().catch((err) => {
  console.error(`\n${err.stack || err.message}\n`);
  process.exit(1);
});
