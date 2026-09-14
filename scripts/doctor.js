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

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let warnings = 0;

const ok = (m, detail) => console.log(`  ✓ ${m}${detail ? `  ${detail}` : ''}`);
const bad = (m, fix) => { failures += 1; console.log(`  ✗ ${m}`); if (fix) console.log(`      → ${fix}`); };
const warn = (m, fix) => { warnings += 1; console.log(`  ! ${m}`); if (fix) console.log(`      → ${fix}`); };

/** Parses KEY=value lines; returns null when the file is absent. */
const readEnv = (file) => {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  const out = {};
  fs.readFileSync(full, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return out;
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

const httpJson = (url) =>
  new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
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
  const smtpKeys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];
  const smtpMissing = smtpKeys.filter((k) => !server[k]);

  if (!smtpMissing.length) {
    ok('SMTP is configured', `${server.SMTP_HOST}:${server.SMTP_PORT || 587} as ${mask(server.SMTP_USER)}`);
    if (!server.MAIL_FROM_ADDRESS) warn('MAIL_FROM_ADDRESS is empty', 'Codes will be sent from SMTP_USER.');
  } else {
    warn(`SMTP is not configured (missing ${smtpMissing.join(', ')})`,
         'Sign-up still works: the code is printed in the server terminal and shown on the verification ' +
         'screen. Fill in SMTP_* in server/.env to email codes for real.');
  }

  if (!server.JWT_SECRET || server.JWT_SECRET.startsWith('change-me')) {
    warn('JWT_SECRET is still the example value',
         'Fine locally; generate a real one before deploying (openssl rand -hex 48).');
  } else {
    ok('JWT_SECRET is set');
  }

  if (!server.SEED_ADMIN_PASSWORD) {
    warn('SEED_ADMIN_PASSWORD is empty',
         'Run `npm run setup` to set one, then `npm run seed` to create the admin account.');
  } else {
    ok('admin account credentials are set', server.SEED_ADMIN_EMAIL || '');
  }

  console.log('\nServices');
  const port = Number(server.PORT || 5000);
  const apiUp = await portOpen('127.0.0.1', port);
  if (apiUp) {
    const health = await httpJson(`http://127.0.0.1:${port}/api/health`);
    if (health?.success) ok(`API is running on port ${port}`);
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
