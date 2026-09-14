#!/usr/bin/env node
'use strict';

/**
 * Checks the configuration that Google sign-in (and the rest of local dev)
 * depends on, and says exactly what to change when something is wrong.
 *
 *   npm run doctor
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const GOOGLE_SUFFIX = '.apps.googleusercontent.com';

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

const isRealClientId = (v) => Boolean(v) && v.endsWith(GOOGLE_SUFFIX) && !v.startsWith('your-');

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

  console.log('\nGoogle sign-in');
  const serverId = server.GOOGLE_CLIENT_ID || '';
  const clientId = client.VITE_GOOGLE_CLIENT_ID || '';
  const adminId = admin?.VITE_GOOGLE_CLIENT_ID || '';

  if (!serverId) {
    bad('server/.env has no GOOGLE_CLIENT_ID', 'Create an OAuth client ID, then run `npm run setup`.');
  } else if (!isRealClientId(serverId)) {
    bad(
      `server/.env GOOGLE_CLIENT_ID is still the placeholder  ${mask(serverId)}`,
      'Create a real one at https://console.cloud.google.com → Credentials → OAuth client ID → Web application.'
    );
  } else {
    ok('server GOOGLE_CLIENT_ID looks real', mask(serverId));
  }

  if (!isRealClientId(clientId)) {
    bad(`client/.env VITE_GOOGLE_CLIENT_ID is not set to a real client ID  ${mask(clientId)}`,
        'Run `npm run setup` and paste the client ID at the first prompt.');
  } else {
    ok('client VITE_GOOGLE_CLIENT_ID looks real', mask(clientId));
  }

  if (isRealClientId(serverId) && isRealClientId(clientId)) {
    if (serverId === clientId) {
      ok('client and server client IDs match');
    } else {
      bad('client and server are using DIFFERENT client IDs — sign-in will always fail',
          'They must be byte-identical. Run `npm run setup` and paste the same value.');
    }
  }

  if (admin && isRealClientId(serverId) && adminId && adminId !== serverId) {
    warn('admin/.env uses a different client ID from the server',
         'Admin sign-in will fail. Run `npm run setup` to sync all three.');
  }

  if (isRealClientId(clientId)) {
    console.log('\n  Check these are listed as Authorised JavaScript origins on that OAuth client:');
    console.log('    http://localhost:5173   (storefront)');
    console.log('    http://localhost:5174   (admin panel)');
    console.log('  A missing origin shows as "Error 401: invalid_client" or a popup that closes instantly.');
  }

  const devLogin = String(server.ENABLE_DEV_LOGIN || '').toLowerCase() === 'true';
  if (devLogin) {
    warn('ENABLE_DEV_LOGIN=true — the "Continue without Google" button is showing',
         'Harmless locally; set it to false once Google sign-in works. Never enable it in production.');
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
  console.log('If Google sign-in still fails, the browser console will now show the specific reason.\n');
};

main().catch((err) => {
  console.error('doctor failed:', err.message);
  process.exit(1);
});
