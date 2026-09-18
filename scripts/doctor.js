#!/usr/bin/env node
'use strict';

/**
 * Checks the configuration local development depends on and says exactly what
 * to change when something is wrong.
 *
 *   npm run doctor
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const tls = require('tls');

const { readEnvFile, looksUnreadable } = require('./env-file');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let warnings = 0;

const ok = (m, detail) => console.log(`  ✓ ${m}${detail ? `  ${detail}` : ''}`);
const bad = (m, fix) => { failures += 1; console.log(`  ✗ ${m}`); if (fix) console.log(`      → ${fix}`); };
const warn = (m, fix) => { warnings += 1; console.log(`  ! ${m}`); if (fix) console.log(`      → ${fix}`); };

/**
 * Parses KEY=value lines; returns null when the file is absent.
 *
 * Encodings are handled in env-file.js — a UTF-16 or BOM-prefixed file parses
 * as completely empty otherwise, which is the confusing state this whole
 * script exists to explain.
 */
const envFiles = {};
const readEnv = (file) => {
  const parsed = readEnvFile(path.join(ROOT, file));
  envFiles[file] = parsed;
  return parsed ? parsed.values : null;
};

/** Never print a full credential; enough to compare by eye. */
const mask = (v) => (!v ? '(empty)' : v.length <= 14 ? v : `${v.slice(0, 8)}…${v.slice(-18)}`);

const portOpen = (host, port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(1500);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });

/**
 * Opens a TLS connection and reports the negotiated protocol, or null when the
 * port is not speaking TLS at all. The certificate is not trusted in
 * development, so verification is deliberately off — this asks "is this TLS?",
 * not "is this certificate valid?".
 */
const tlsProbe = (host, port) =>
  new Promise((resolve) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false, servername: 'localhost' }, () => {
      const cert = socket.getPeerCertificate();
      resolve({
        protocol: socket.getProtocol(),
        issuer: cert?.issuer?.O || cert?.issuer?.CN || '',
        subject: cert?.subject?.CN || '',
        selfSigned: Boolean(cert?.issuer && cert?.subject && cert.issuer.CN === cert.subject.CN),
        validTo: cert?.valid_to || '',
      });
      socket.end();
    });
    socket.setTimeout(2500);
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    socket.on('error', () => resolve(null));
  });

/**
 * Fetches JSON over http or https, whichever the URL says. The development
 * certificate is self-signed and deliberately not trusted by anything, so
 * verification is off here — this only ever talks to a port on this machine,
 * and the point is to read the health endpoint, not to vouch for the cert.
 */
const httpJson = (url) =>
  new Promise((resolve) => {
    const secure = url.startsWith('https:');
    const client = secure ? https : http;
    const options = secure ? { timeout: 2500, rejectUnauthorized: false } : { timeout: 2500 };

    const req = client.get(url, options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });

const main = async () => {
  console.log('\nFresh Meat Nepal — configuration check\n');

  const server = readEnv('server/.env');
  const client = readEnv('client/.env');
  const admin = readEnv('admin/.env');

  console.log('Environment files');
  if (!server) bad('server/.env is missing', 'Run `npm run setup` from the project root.');
  else ok('server/.env found');
  if (!client) bad('client/.env is missing', 'Run `npm run setup` from the project root.');
  else ok('client/.env found');
  if (!admin) warn('admin/.env is missing', 'Run `npm run setup` — the admin panel needs it.');
  else ok('admin/.env found');

  if (!server || !client) {
    console.log('\nFix the missing files first, then run `npm run doctor` again.\n');
    process.exit(1);
  }

  /*
   * This script can decode UTF-16 and BOMs; dotenv and Vite cannot. So a file
   * that reads perfectly here may still be invisible to the running app, which
   * then falls back to its defaults — and in development the defaults work,
   * so nothing looks wrong until a real value is needed.
   */
  const misencoded = ['server/.env', 'client/.env', 'admin/.env'].filter(
    (f) => envFiles[f] && envFiles[f].encoding !== 'utf-8'
  );
  if (misencoded.length) {
    misencoded.forEach((f) => {
      bad(`${f} is ${envFiles[f].encoding}, not plain UTF-8 — dotenv and Vite read it as empty`,
          'Usually PowerShell `>` (writes UTF-16) or Notepad saving "UTF-8" with a BOM. ' +
          'The app has been running on its built-in defaults, ignoring this file.');
    });
    console.log('\n  Run `npm run setup` — it rewrites these as plain UTF-8 and keeps your values.\n');
    process.exit(1);
  }

  // A file that exists but defines almost nothing is the common broken state:
  // every later check fails confusingly, so call out the real problem once.
  const thin = [
    ['server/.env', server, ['MONGODB_URI', 'JWT_SECRET', 'PORT']],
    ['client/.env', client, ['VITE_API_URL']],
  ].filter(([, env, required]) => required.some((key) => env[key] === undefined));

  if (thin.length) {
    thin.forEach(([label, env, required]) => {
      const missing = required.filter((key) => env[key] === undefined);
      bad(`${label} is incomplete — missing ${missing.join(', ')}`,
          'Run `npm run setup` to restore the missing settings from .env.example (your existing values are kept).');
    });
    console.log('\nRun `npm run setup`, then `npm run doctor` again.\n');
    process.exit(1);
  }

  console.log('\nEmail delivery (4-digit verification codes)');
  // `.env.example` ships readable placeholders, which are not real values.
  const placeholder = (v) => {
    const t = String(v || '').trim().toLowerCase();
    return !t || t.startsWith('your-') || t.startsWith('change-me') || t.startsWith('<');
  };
  const smtpKeys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];
  const smtpMissing = smtpKeys.filter((k) => placeholder(server[k]));

  if (!smtpMissing.length) {
    ok('SMTP is configured', `${server.SMTP_HOST}:${server.SMTP_PORT || 587} as ${mask(server.SMTP_USER)}`);
    if (!server.MAIL_FROM_ADDRESS) warn('MAIL_FROM_ADDRESS is empty', 'Codes will be sent from SMTP_USER.');
  } else {
    warn(`SMTP is not configured (${smtpMissing.join(', ')} still unset or placeholder)`,
         'Sign-up still works: the code is printed in the server terminal and shown on the verification ' +
         'screen. Fill in SMTP_* in server/.env to email codes for real.');
  }

  if (placeholder(server.JWT_SECRET)) {
    warn('JWT_SECRET is still the example value',
         'Fine locally; generate a real one before deploying (openssl rand -hex 48).');
  } else {
    ok('JWT_SECRET is set');
  }

  if (placeholder(server.SEED_ADMIN_PASSWORD)) {
    warn('SEED_ADMIN_PASSWORD is empty',
         'Run `npm run setup` to set one, then `npm run seed` to create the admin account.');
  } else {
    ok('admin account credentials are set', server.SEED_ADMIN_EMAIL || '');
  }

  console.log('\nServices');
  const port = Number(server.PORT || 5000);
  const apiUp = await portOpen('127.0.0.1', port);
  if (apiUp) {
    // Ask the port which language it speaks before speaking it: an API serving
    // TLS answers a plain-HTTP request with a handshake error, which used to
    // be reported here as "something else is on this port".
    const apiTls = await tlsProbe('127.0.0.1', port);
    const scheme = apiTls ? 'https' : 'http';
    const health = await httpJson(`${scheme}://127.0.0.1:${port}/api/health`);
    if (health?.success) ok(`API is running on port ${port}`, `over ${scheme.toUpperCase()}`);
    else warn(`Something is on port ${port} but it is not this API`, 'Check the terminal running `npm run dev`.');
  } else {
    bad(`API is not running on port ${port}`, 'Start it with `npm run dev` from the project root.');
  }

  const apiUrl = client.VITE_API_URL || '';
  const apiPort = Number((apiUrl.match(/:(\d+)/) || [])[1] || 0);
  if (apiPort && apiPort !== port) {
    bad(`client/.env points at port ${apiPort} but the server runs on ${port}`,
        'Run `npm run setup` and give the same port at the port prompt.');
  } else if (apiPort) {
    ok('client VITE_API_URL points at the API port', apiUrl);
  }

  console.log('\nTLS');
  const sslKey = server.SSL_KEY_PATH || '';
  const sslCert = server.SSL_CERT_PATH || '';
  const forceHttps = String(server.FORCE_HTTPS || '').toLowerCase();

  if (apiUp) {
    const handshake = await tlsProbe('127.0.0.1', port);
    if (handshake) {
      ok(`API is serving HTTPS on port ${port}`, `${handshake.protocol}${handshake.validTo ? `, certificate valid to ${handshake.validTo}` : ''}`);
      if (handshake.selfSigned) {
        warn('the certificate is self-signed, so browsers will warn',
             'Expected for local development. Production certificates come from a CA (Let\'s Encrypt is free).');
      }
      if (!/^https:/.test(client.VITE_API_URL || '')) {
        bad('the API speaks HTTPS but client/.env still points at http://',
            `Set VITE_API_URL=https://localhost:${port}/api in client/.env and admin/.env, then restart.`);
      }
      if (!/^https:/.test(server.BACKEND_URL || '')) {
        warn('BACKEND_URL is still http:// — eSewa callbacks would come back over plain HTTP',
             `Set BACKEND_URL=https://localhost:${port} in server/.env.`);
      }
    } else if (sslKey || sslCert) {
      bad('SSL_KEY_PATH/SSL_CERT_PATH are set but the API is still on plain HTTP',
          'Both must be set and point at files that exist. Run `npm run ssl:dev --prefix server`, then restart the server.');
    } else {
      ok('API is serving plain HTTP', 'the default — TLS is expected to terminate at a proxy in production');
    }
  } else {
    warn('cannot check TLS while the API is down');
  }

  /*
   * The API speaking TLS is only half of it: the address bar shows the site,
   * not the API, so a storefront still on http:// is what a visitor notices.
   */
  for (const [label, envFile, port] of [['storefront', client, 5173], ['admin panel', admin, 5174]]) {
    const configured = Boolean(envFile?.SSL_KEY_PATH && envFile?.SSL_CERT_PATH);
    const live = await portOpen('127.0.0.1', port);
    if (!live) {
      if (configured) ok(`${label} is set up for HTTPS`, 'not running, so not checked');
      continue;
    }
    const handshake = await tlsProbe('127.0.0.1', port);
    if (handshake) ok(`${label} is serving HTTPS on port ${port}`, handshake.protocol);
    else if (configured) {
      bad(`${label} has certificates configured but is still on plain HTTP`,
          'Restart `npm run dev` — Vite reads the certificate at startup.');
    } else {
      ok(`${label} is serving plain HTTP on port ${port}`, 'the default for development');
    }
  }

  if (!sslKey && !sslCert) {
    console.log('      → To put the whole site on HTTPS locally: `npm run ssl:dev`, then restart `npm run dev`.');
  }
  if (forceHttps === 'true') {
    ok('FORCE_HTTPS=true — plain HTTP will be redirected and HSTS sent');
  }
  ok('outbound TLS floor', `${server.TLS_MIN_VERSION || 'TLSv1.2'} (eSewa, SMTP, MongoDB)`);

  const mongoMatch = (server.MONGODB_URI || '').match(/\/\/([^:/]+):(\d+)/);
  if (mongoMatch) {
    const up = await portOpen(mongoMatch[1], Number(mongoMatch[2]));
    if (up) ok(`MongoDB is reachable at ${mongoMatch[1]}:${mongoMatch[2]}`);
    else bad(`MongoDB is not reachable at ${mongoMatch[1]}:${mongoMatch[2]}`,
             'Start it (Windows: `Get-Service MongoDB`) or use a MongoDB Atlas connection string.');
  } else if (server.MONGODB_URI) {
    ok('MONGODB_URI is a remote connection string (not checked from here)');
  }

  console.log('');
  if (failures) {
    console.log(`${failures} problem${failures === 1 ? '' : 's'} found${warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.`);
    console.log('Fix the ✗ lines above, restart `npm run dev`, then run `npm run doctor` again.\n');
    process.exit(1);
  }

  console.log(`Everything checks out${warnings ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''}.`);
  console.log('Start the apps with `npm run dev`, then sign up at http://localhost:5173/register\n');
};

main().catch((err) => {
  console.error('doctor failed:', err.message);
  process.exit(1);
});
