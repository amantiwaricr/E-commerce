#!/usr/bin/env node
'use strict';

/**
 * Checks what production needs before anyone pushes to a host.
 *
 *   npm run predeploy
 *
 * `npm run doctor` answers "can I develop here?". This answers "will this
 * survive being public?", which is a different list: real secrets rather than
 * example ones, https URLs rather than localhost, a signing key, and a build
 * whose baked-in URLs point at the site people will actually visit.
 *
 * Every check here corresponds to something that fails silently. A canonical
 * URL of http://localhost:5173 does not throw — it deindexes the site. Exits
 * non-zero when anything is wrong, so CI can gate on it.
 */

const fs = require('fs');
const path = require('path');

const { readEnvFile } = require('./env-file');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

const ok = (m, d) => console.log(`  ✓ ${m}${d ? `  ${d}` : ''}`);
const bad = (m, fix) => { failures += 1; console.log(`  ✗ ${m}`); if (fix) console.log(`      → ${fix}`); };
const warn = (m, fix) => { warnings += 1; console.log(`  ! ${m}`); if (fix) console.log(`      → ${fix}`); };

const values = (file) => (readEnvFile(path.join(ROOT, file)) || { values: {} }).values;

/** Values shipped in .env.example. Present in production, they are a hole. */
const PLACEHOLDERS = [
  'change-me',
  'your-',
  'example.com',
  'dev-only-insecure-secret',
  '8gBm/:&EnhH.1/q', // eSewa's published sandbox secret
  'EPAYTEST',
];

const isPlaceholder = (value) =>
  !value || PLACEHOLDERS.some((token) => String(value).toLowerCase().includes(token.toLowerCase()));

const isLocal = (value) => /localhost|127\.0\.0\.1|\[?::1\]?|\.local\b/i.test(String(value || ''));
const isHttps = (value) => /^https:\/\//i.test(String(value || ''));

/**
 * Suffixes under which every subdomain is a separate site.
 *
 * These are on the Public Suffix List, which is what browsers actually consult
 * when deciding whether a cookie is first-party. Taking the last two labels —
 * the obvious shortcut — calls `shop.vercel.app` and `api.vercel.app` the same
 * site and tells you a plain cookie will work between them. It will not: they
 * are as unrelated as two different companies, by design, because otherwise
 * anyone's free deployment could read anyone else's cookies.
 *
 * Not the whole list, which runs to thousands of entries. These are the free
 * hosts this project is likely to land on.
 */
const MULTI_TENANT_SUFFIXES = [
  'vercel.app', 'netlify.app', 'onrender.com', 'railway.app', 'up.railway.app',
  'fly.dev', 'herokuapp.com', 'pages.dev', 'workers.dev', 'github.io',
  'glitch.me', 'azurewebsites.net', 'appspot.com', 'firebaseapp.com', 'web.app',
  'surge.sh', 'koyeb.app', 'deno.dev', 'ngrok.io', 'ngrok-free.app',
];

/**
 * Whether two URLs are the same site for cookie purposes — which is what
 * decides whether the session survives without SameSite=None.
 */
const sameRegistrableSite = (a, b) => {
  const host = (value) => { try { return new URL(value).hostname.toLowerCase(); } catch { return ''; } };
  const [ha, hb] = [host(a), host(b)];
  if (!ha || !hb) return false;
  if (ha === hb) return true;

  const suffix = MULTI_TENANT_SUFFIXES.find((s) => ha.endsWith(`.${s}`) || ha === s);
  // Under a public suffix, only the exact same hostname is the same site.
  if (suffix) return false;

  const registrable = (h) => h.split('.').slice(-2).join('.');
  return registrable(ha) === registrable(hb);
};

const section = (title) => console.log(`\n${title}`);

/* ── secrets ─────────────────────────────────────────────────────────────── */

const checkSecrets = (server) => {
  section('Secrets');

  if (!server.JWT_SECRET) bad('JWT_SECRET is not set', 'Generate one: openssl rand -hex 48');
  else if (isPlaceholder(server.JWT_SECRET)) bad('JWT_SECRET is still the example value', 'Anyone reading this repo can mint a session for any account. Generate a new one.');
  else if (server.JWT_SECRET.length < 32) bad(`JWT_SECRET is only ${server.JWT_SECRET.length} characters`, 'Use at least 32; 96 hex characters is a good default.');
  else ok('JWT_SECRET is set and long enough');

  if (!server.TXN_SIGNING_KEY) bad('TXN_SIGNING_KEY is not set', 'Run `npm run keys:txn`. Without it orders are recorded unsigned and the server refuses to boot in production.');
  else ok('transaction ledger signing key is set', `key ${server.TXN_SIGNING_KEY_ID || 'default'}`);

  if (!server.MONGODB_URI) bad('MONGODB_URI is not set');
  else if (isLocal(server.MONGODB_URI)) bad('MONGODB_URI points at localhost', 'A host cannot reach your laptop. Use a managed database (MongoDB Atlas) or the private address of one in the same network.');
  else if (!/^mongodb(\+srv)?:\/\/[^:]+:[^@]+@/.test(server.MONGODB_URI)) warn('MONGODB_URI carries no username and password', 'An unauthenticated database reachable from the internet will be found and emptied.');
  else ok('MONGODB_URI is remote and authenticated');

  if (server.SEED_ADMIN_PASSWORD && server.SEED_ADMIN_PASSWORD.length < 12) {
    warn(`SEED_ADMIN_PASSWORD is only ${server.SEED_ADMIN_PASSWORD.length} characters`, 'This is the account that can see every order. Use a long, unique password.');
  }
};

/* ── addresses ───────────────────────────────────────────────────────────── */

const checkUrls = (server, client, admin) => {
  section('Public addresses');

  const urls = [
    ['server/.env', 'FRONTEND_URL', server.FRONTEND_URL],
    ['server/.env', 'BACKEND_URL', server.BACKEND_URL],
    ['server/.env', 'ADMIN_URL', server.ADMIN_URL],
    ['server/.env', 'SITE_URL', server.SITE_URL],
    ['client/.env', 'VITE_API_URL', client.VITE_API_URL],
    ['client/.env', 'VITE_SITE_URL', client.VITE_SITE_URL],
    ['admin/.env', 'VITE_API_URL', admin.VITE_API_URL],
  ];

  let clean = true;
  urls.forEach(([file, key, value]) => {
    if (!value) { bad(`${file}: ${key} is not set`); clean = false; return; }
    if (isLocal(value)) { bad(`${file}: ${key} is ${value}`, 'Set it to the real public address before building — this value is baked into the bundle and into every canonical URL.'); clean = false; return; }
    if (!isHttps(value)) { bad(`${file}: ${key} is not https`, 'Secure cookies and the HTTPS redirect both depend on this.'); clean = false; }
  });
  if (clean) ok('every public URL is https and not localhost');

  const sameSite = sameRegistrableSite(server.FRONTEND_URL, server.BACKEND_URL);

  if (sameSite) ok('the site and the API are on the same registrable domain', 'session cookies work without SameSite=None');
  else if ((server.COOKIE_SAMESITE || '').toLowerCase() === 'none' && String(server.COOKIE_SECURE).toLowerCase() === 'true') {
    ok('cross-site deployment is configured', 'COOKIE_SAMESITE=none with COOKIE_SECURE=true');
  } else {
    // Worth stating plainly: sign-in still works here, because the API returns
    // a token in the login response and the client sends it as a Bearer
    // header. The cookie is the belt to that braces. Say so, rather than
    // implying the deployment is broken.
    warn('the site and the API are on different sites, so the session cookie will not be sent',
         'Sign-in still works — the client holds a token and sends it as an Authorization header. '
         + 'To have the cookie work too, set COOKIE_SAMESITE=none and COOKIE_SECURE=true, or put both behind one domain.');
  }

  if (String(server.COOKIE_SECURE).toLowerCase() !== 'true') {
    bad('COOKIE_SECURE is not true', 'A session cookie without Secure travels over plain HTTP if anything ever downgrades the connection.');
  } else ok('COOKIE_SECURE is on');
};

/* ── payments and mail ───────────────────────────────────────────────────── */

const checkServices = (server) => {
  section('Payments and email');

  if ((server.ESEWA_MODE || 'sandbox') !== 'production') {
    warn('ESEWA_MODE is not "production"', 'Real payments will not be taken. Switch it once eSewa has issued live credentials.');
  } else if (isPlaceholder(server.ESEWA_MERCHANT_CODE) || isPlaceholder(server.ESEWA_SECRET_KEY)) {
    bad('ESEWA_MODE is production but the credentials are still the sandbox ones',
        'EPAYTEST and its secret are published by eSewa. Payments signed with them are not real.');
  } else ok('eSewa is in production mode with its own credentials');

  if (!server.SMTP_HOST || isPlaceholder(server.SMTP_HOST)) {
    bad('SMTP is not configured', 'Sign-up needs it: without SMTP the verification code is only printed in the server log, so nobody can create an account.');
  } else ok('SMTP is configured', `${server.SMTP_HOST} as ${server.SMTP_USER || '(no user)'}`);
};

/* ── the build ───────────────────────────────────────────────────────────── */

/**
 * A development address left in the built output.
 *
 * The port is required, and that is deliberate: `axios` ships the literal
 * `"http://localhost"` as a fallback for `window.location.href` in a worker,
 * so matching bare "localhost" flags every build that has ever been correct.
 * Every address this project could bake in carries a port — 5000, 5001, 5173,
 * 5174 — so requiring one separates ours from the dependency's.
 */
const DEV_ADDRESS = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/g;

/** Text files worth scanning. A .png cannot contain a URL that matters here. */
const SCANNABLE = new Set(['.html', '.js', '.css', '.txt', '.xml', '.json', '.webmanifest']);

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const checkBuild = (app, expectSite) => {
  const dist = path.join(ROOT, app, 'dist');
  if (!fs.existsSync(dist)) {
    warn(`${app}/dist does not exist`, `Run \`npm run build --prefix ${app}\` — this check inspects what the build produced.`);
    return;
  }

  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) { bad(`${app}/dist has no index.html`); return; }

  /*
   * The whole build, not just index.html. Vite inlines VITE_* values where
   * they are used, which for the API address means the JavaScript bundle —
   * checking only the HTML passed a build whose every request pointed at
   * localhost.
   */
  const offenders = [];
  walk(dist).forEach((file) => {
    if (!SCANNABLE.has(path.extname(file))) return;
    const found = fs.readFileSync(file, 'utf8').match(DEV_ADDRESS);
    if (found) offenders.push(`${path.relative(dist, file)} (${[...new Set(found)].join(', ')})`);
  });

  if (offenders.length) {
    bad(`${app}/dist still contains development addresses`,
        `${offenders.slice(0, 3).join('; ')}. The build baked in the values from ${app}/.env — set the real ones, delete dist, and build again.`);
  } else {
    ok(`${app}/dist carries no development addresses`, `${walk(dist).length} files scanned`);
  }

  if (!expectSite) return;

  ['robots.txt', 'sitemap.xml'].forEach((file) => {
    const full = path.join(dist, file);
    if (!fs.existsSync(full)) { bad(`${app}/dist/${file} is missing`, 'It is written by the prerender step in `npm run build`.'); return; }
    if (DEV_ADDRESS.test(fs.readFileSync(full, 'utf8'))) bad(`${app}/dist/${file} points at a development address`);
    else ok(`${app}/dist/${file}`);
    DEV_ADDRESS.lastIndex = 0; // /g regexes keep state between .test() calls.
  });

  const canonical = (fs.readFileSync(index, 'utf8').match(/rel="canonical" href="([^"]+)"/) || [])[1];
  if (canonical && isLocal(canonical)) bad(`${app}: the canonical URL is ${canonical}`, 'Search engines would index localhost. Set VITE_SITE_URL and rebuild.');
  else if (canonical) ok('canonical URL', canonical);
};

/* ── run ─────────────────────────────────────────────────────────────────── */

const main = () => {
  console.log('\nFresh Meat Nepal — pre-deployment check\n');
  console.log('Reads the .env files that will be used for the build. Run it against the');
  console.log('production values, not the ones you develop with.');

  const missing = ['server/.env', 'client/.env', 'admin/.env'].filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) {
    console.error(`\nMissing ${missing.join(', ')}. Run \`npm run setup\` first.\n`);
    return process.exit(1);
  }

  const server = values('server/.env');
  const client = values('client/.env');
  const admin = values('admin/.env');

  checkSecrets(server);
  checkUrls(server, client, admin);
  checkServices(server);

  section('Built output');
  checkBuild('client', true);
  checkBuild('admin', false);

  console.log('');
  if (failures) {
    console.log(`${failures} blocker${failures === 1 ? '' : 's'}${warnings ? ` and ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}. Fix the ✗ lines before deploying.\n`);
    return process.exit(1);
  }

  console.log(warnings ? `Ready to deploy, with ${warnings} warning${warnings === 1 ? '' : 's'} above.\n` : 'Ready to deploy.\n');
  return undefined;
};

if (require.main === module) main();

// Exported for the test suite; the script still runs when invoked directly.
module.exports = { sameRegistrableSite, MULTI_TENANT_SUFFIXES };
