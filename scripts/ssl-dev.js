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

const { execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const { readEnvFile, setValues } = require('./env-file');

const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'server', 'certs');
const KEY = path.join(CERT_DIR, 'dev-key.pem');
const CERT = path.join(CERT_DIR, 'dev-cert.pem');
const CA = path.join(CERT_DIR, 'dev-ca.pem');

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

const loadIssuer = () => {
  try {
    return require('./dev-certificate');
  } catch (err) {
    console.error('\nThe certificate library is missing or failed to load:');
    console.error(`  ${err.message}`);
    console.error('\n  Run `npm install` in the project root, then try again.\n');
    return process.exit(1);
  }
};

const generate = async () => {
  if (fs.existsSync(KEY) && fs.existsSync(CERT) && fs.existsSync(CA)) {
    console.log('✓ certificate already present in server/certs');
    return;
  }

  const { issue, LEAF_DAYS } = loadIssuer();
  fs.mkdirSync(CERT_DIR, { recursive: true });

  let pems;
  try {
    pems = await issue();
  } catch (err) {
    console.error('\nThe certificate could not be created:\n');
    console.error(`  ${err.message}\n`);
    return process.exit(1);
  }

  // 0o600 on the key: it is only ever read by processes on this machine, but a
  // private key with default permissions is a habit worth not having.
  fs.writeFileSync(KEY, pems.key, { mode: 0o600 });
  fs.writeFileSync(CERT, pems.cert);
  fs.writeFileSync(CA, pems.ca);
  console.log(`✓ issued a certificate for localhost, valid ${LEAF_DAYS} days`);
  console.log('  signed by a local development root — see `npm run ssl:trust`');
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

/** Whether something is already listening — i.e. an old `npm run dev` is still up. */
const portBusy = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.setTimeout(700);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });

/**
 * The single most common reason "it still says http" after switching: the old
 * dev server never died. It keeps the port, the new one silently moves to
 * another, and the browser tab is still being served plain HTTP by the process
 * that started before the certificate existed. Ctrl+C in a `--parallel` runner
 * does not reliably take its children with it, least of all on Windows.
 */
const warnAboutRunningServers = async (origins) => {
  const ports = [...new Set([origins.site, origins.admin, origins.api].map((o) => portOf(o('https'))))];
  const busy = [];
  for (const port of ports) if (await portBusy(Number(port))) busy.push(port);
  if (!busy.length) return;

  console.log(`\n! Something is already listening on port ${busy.join(', ')}.`);
  console.log('  That is the old dev server, and it is still serving plain HTTP. Stop it');
  console.log('  before starting again, or you will keep seeing http:// in the browser:');
  console.log('    Windows      Get-Process node | Stop-Process -Force');
  console.log('    macOS/Linux  pkill -f vite; pkill -f "node src/index.js"');
};

/**
 * Re-reads what was just written and checks it is actually usable.
 *
 * Writing a file and assuming it took is how "it still says http" happens with
 * every command apparently succeeding: the server and Vite both fall back to
 * plain HTTP without complaint when a path does not resolve, so the failure
 * only ever surfaces as an absence.
 */
const verifyWritten = () => {
  const problems = [];
  if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) problems.push('the certificate is not in server/certs');
  if (!fs.existsSync(CA)) problems.push('the development root (dev-ca.pem) is not in server/certs');

  Object.entries(ENVS).forEach(([app, file]) => {
    const values = valuesIn(file);
    ['SSL_KEY_PATH', 'SSL_CERT_PATH'].forEach((key) => {
      const value = values[key];
      if (!value) {
        problems.push(`${app}/.env has no ${key}`);
        return;
      }
      const full = path.isAbsolute(value) ? value : path.resolve(path.dirname(file), value);
      if (!fs.existsSync(full)) problems.push(`${app}/.env ${key} points at ${full}, which is not there`);
    });
  });

  return problems;
};

const turnOn = async (origins) => {
  await generate();
  report(apply('https', origins));

  const problems = verifyWritten();
  if (problems.length) {
    console.error('\n✗ HTTPS was NOT switched on. What is wrong:\n');
    problems.forEach((problem) => console.error(`    ${problem}`));
    console.error('\n  Nothing was left half-done on purpose — this check runs after the');
    console.error('  writes precisely so the command cannot claim success it did not have.');
    console.error('  Send me these lines and I will tell you what is blocking it.\n');
    return process.exit(1);
  }

  console.log('\nHTTPS is on. Restart `npm run dev`, then open:');
  console.log(`  storefront  ${origins.site('https')}`);
  console.log(`  admin       ${origins.admin('https')}`);
  console.log(`  API         ${origins.api('https')}/api/health`);

  const ports = [origins.site, origins.admin, origins.api].map((o) => portOf(o('https')));
  console.log(`\nThe browser will still say "Not secure" until you trust the root once:`);
  console.log('\n      npm run ssl:trust\n');
  console.log(`Without that step the traffic is encrypted but unvouched-for, and you have`);
  console.log(`to click through a warning on each port (${ports.join(', ')}).`);

  await warnAboutRunningServers(origins);

  console.log('\nStill seeing http?  npm run ssl:status');
  console.log('To go back:         npm run ssl:dev -- off\n');
};

const turnOff = (origins) => {
  report(apply('http', origins));
  console.log('\n✓ HTTPS off — all three apps are back on http. Restart `npm run dev`.');
  console.log('  The certificate is left in server/certs; delete it to start fresh.\n');
};

const CA_NAME = 'Fresh Meat Nepal Local Development CA';

/**
 * How to put the development root into the trust store, per platform.
 *
 * Chrome does not keep its own list on Windows or macOS — it asks the OS — so
 * this is what turns "Not secure" into a padlock. On Linux, Chrome uses its own
 * NSS database instead, which is why that one looks nothing like the others.
 */
const TRUST = {
  win32: {
    // -user: the current account's store. No administrator rights needed.
    add: ['certutil', ['-user', '-addstore', 'Root', CA]],
    remove: ['certutil', ['-user', '-delstore', 'Root', CA_NAME]],
    list: ['certutil', ['-user', '-store', 'Root']],
    where: 'Windows certificate store (Current User → Trusted Root)',
  },
  darwin: {
    add: ['security', ['add-trusted-cert', '-r', 'trustRoot', '-k', path.join(os.homedir(), 'Library/Keychains/login.keychain-db'), CA]],
    remove: ['security', ['delete-certificate', '-c', CA_NAME]],
    list: ['security', ['find-certificate', '-c', CA_NAME]],
    where: 'login keychain',
  },
  linux: {
    // Chrome on Linux reads NSS, not /etc/ssl. The nssdb may not exist yet.
    add: ['certutil', ['-d', `sql:${path.join(os.homedir(), '.pki/nssdb')}`, '-A', '-t', 'C,,', '-n', CA_NAME, '-i', CA]],
    remove: ['certutil', ['-d', `sql:${path.join(os.homedir(), '.pki/nssdb')}`, '-D', '-n', CA_NAME]],
    list: ['certutil', ['-d', `sql:${path.join(os.homedir(), '.pki/nssdb')}`, '-L']],
    where: "Chrome's NSS database (~/.pki/nssdb)",
  },
};

const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg}"` : arg);
const asCommand = ([exe, args]) => `${exe} ${args.map(quote).join(' ')}`;

/** Best-effort: the store is readable, so just look for the name in it. */
const isTrusted = (platform) => {
  const plan = TRUST[platform];
  if (!plan) return null;
  try {
    return execFileSync(plan.list[0], plan.list[1], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .includes(CA_NAME);
  } catch {
    return null; // The tool is missing, or the store does not exist yet.
  }
};

const trust = (remove) => {
  const plan = TRUST[process.platform];
  if (!plan) {
    console.error(`\nI do not know how to reach the trust store on ${process.platform}.`);
    console.error(`Install ${CA} as a trusted root by hand.\n`);
    return process.exit(1);
  }

  if (!remove && !fs.existsSync(CA)) {
    console.error('\nThere is no root to trust yet. Run `npm run ssl:dev` first.\n');
    return process.exit(1);
  }

  const [exe, args] = remove ? plan.remove : plan.add;

  if (!remove) {
    console.log(`This installs one certificate into your ${plan.where}:\n`);
    console.log(`    ${CA_NAME}`);
    console.log(`    ${CA}\n`);
    console.log('  Afterwards your browser shows a padlock on localhost instead of');
    console.log('  "Not secure", because the certificate the apps serve now chains to');
    console.log('  a root your machine trusts.\n');
    console.log('  It is safe to install because its private key does not exist. It was');
    console.log('  created in memory, used once to sign the localhost certificate, and');
    console.log('  discarded — so nobody, including you, can issue anything else with');
    console.log('  it. That is the whole risk of trusting a root, and it is not here.\n');
    console.log(`  To remove it later:  npm run ssl:untrust\n`);
  }

  console.log(`Running: ${asCommand([exe, args])}\n`);
  try {
    const out = execFileSync(exe, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
    if (out.trim()) console.log(out.trim());
  } catch (err) {
    console.error(`\n✗ That command failed:\n`);
    console.error(`  ${String(err.stderr || err.message).trim()}\n`);
    if (process.platform === 'linux') {
      console.error('  On Linux this needs NSS tools: apt install libnss3-tools\n');
    }
    console.error('  You can also do it by hand — double-click the file above and');
    console.error('  choose "Trusted Root Certification Authorities".\n');
    return process.exit(1);
  }

  const trusted = isTrusted(process.platform);
  if (remove) {
    console.log(trusted === false ? '\n✓ removed from the trust store.\n' : '\n✓ done.\n');
    return undefined;
  }

  console.log(trusted === false
    ? '\n! the store does not show it yet — check the output above.\n'
    : '\n✓ trusted.\n');
  console.log('Now quit your browser COMPLETELY and reopen it — Chrome caches the');
  console.log('trust decision per session, so a reload alone still shows the warning.');
  console.log('Then open https://localhost:5173 and you should see a padlock.\n');
  return undefined;
};

/*
 * Everything below is the status report: `npm run ssl:dev -- status`.
 *
 * "It still says http" has several possible causes that look identical from
 * the outside — the .env was never written, the certificate is missing, the
 * paths in it do not resolve from the app that reads them, or another env file
 * is quietly overriding the one that was written. Rather than guess, this
 * prints each of those as a separate line.
 */

/** Vite reads all four, and the later ones win. A stale one silently overrides `.env`. */
const VITE_ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];

const certificateReport = () => {
  console.log('Certificate');
  if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) {
    console.log('  ✗ server/certs is missing a key or certificate  → run `npm run ssl:dev`');
    return;
  }

  const sizes = [['dev-key.pem', KEY], ['dev-cert.pem', CERT], ['dev-ca.pem', CA]];
  for (const [label, file] of sizes) {
    const bytes = fs.statSync(file).size;
    if (bytes === 0) {
      console.log(`  ✗ server/certs/${label} is empty  → delete server/certs and run \`npm run ssl:dev\``);
      return;
    }
    console.log(`  ✓ server/certs/${label}  ${bytes} bytes`);
  }

  try {
    const { X509Certificate } = require('crypto');
    const x509 = new X509Certificate(fs.readFileSync(CERT));
    const expired = new Date(x509.validTo) < new Date();
    console.log(`  ${expired ? '✗' : '✓'} valid ${x509.validFrom} → ${x509.validTo}${expired ? '  (EXPIRED — delete server/certs and re-run)' : ''}`);
    console.log(`  · names: ${x509.subjectAltName || '(none)'}`);
    console.log(`  · issued by: ${x509.issuer.split('\n').find((l) => l.startsWith('CN=')) || '(unknown)'}`);
  } catch (err) {
    console.log(`  ✗ the certificate could not be parsed: ${err.message}`);
  }

  // The difference between an encrypted connection and one the browser will
  // put a padlock on. Everything else can be perfect and this still says no.
  const trusted = isTrusted(process.platform);
  if (trusted === true) console.log('  ✓ the development root is in this machine\'s trust store');
  else if (trusted === false) console.log('  ✗ the development root is NOT trusted  → run `npm run ssl:trust`');
  else console.log('  ? could not read the trust store  → `npm run ssl:trust` installs the root');
};

const appReport = (app, file) => {
  const parsed = readEnvFile(file);
  console.log(`\n${app}/.env`);
  if (!parsed) {
    console.log('  ✗ missing  → run `npm run setup`');
    return;
  }

  const { values, encoding } = parsed;
  console.log(`  · encoding: ${encoding}${encoding === 'utf-8' ? '' : '  (rewritten to UTF-8 on the next `ssl:dev` run)'}`);

  const keys = app === 'server'
    ? ['SSL_KEY_PATH', 'SSL_CERT_PATH', 'PORT', 'BACKEND_URL', 'FRONTEND_URL', 'ADMIN_URL', 'COOKIE_SECURE']
    : ['SSL_KEY_PATH', 'SSL_CERT_PATH', 'VITE_API_URL'];
  keys.forEach((key) => {
    const value = values[key];
    console.log(`  ${value ? '·' : '!'} ${key}=${value === undefined ? '(not set)' : value}`);
  });

  // The check Vite and the server both make: does the path actually resolve
  // from *this* app's directory? A correct-looking value can still point at
  // nothing, and both of them then fall back to plain HTTP.
  const dir = path.dirname(file);
  ['SSL_KEY_PATH', 'SSL_CERT_PATH'].forEach((key) => {
    const value = values[key];
    if (!value) return;
    const full = path.isAbsolute(value) ? value : path.resolve(dir, value);
    console.log(`  ${fs.existsSync(full) ? '✓' : '✗'} ${key} resolves to ${full}${fs.existsSync(full) ? '' : '  — NOT FOUND'}`);
  });

  if (app === 'server') return;

  // Vite merges these in order, so a value in a later file beats the one
  // `ssl:dev` wrote into `.env`.
  VITE_ENV_FILES.slice(1).forEach((name) => {
    const extra = readEnvFile(path.join(dir, name));
    if (!extra) return;
    const shadowed = Object.keys(extra.values).filter((k) => /^(SSL_|VITE_)/.test(k));
    console.log(`  ! ${name} also exists and Vite reads it AFTER .env`);
    if (shadowed.length) console.log(`      → it overrides: ${shadowed.join(', ')}`);
  });
};

/**
 * Turns the detail above into one sentence and one command.
 *
 * A list of ticks and crosses still leaves you to work out what it adds up to,
 * and the states are not equally likely: by far the commonest is that HTTPS was
 * simply never switched on here, which reads as a wall of failures when it is
 * really one unrun command.
 */
const verdict = () => {
  const haveCert = fs.existsSync(KEY) && fs.existsSync(CERT);
  const apps = Object.entries(ENVS).map(([app, file]) => {
    const values = valuesIn(file);
    const key = values.SSL_KEY_PATH;
    const cert = values.SSL_CERT_PATH;
    const dir = path.dirname(file);
    const resolves = (value) =>
      Boolean(value) && fs.existsSync(path.isAbsolute(value) ? value : path.resolve(dir, value));
    return { app, configured: Boolean(key && cert), resolves: resolves(key) && resolves(cert) };
  });

  const configured = apps.filter((a) => a.configured);
  const broken = configured.filter((a) => !a.resolves).map((a) => a.app);

  console.log('\n──────────────────────────────────────────────────────────────');
  if (!haveCert && !configured.length) {
    console.log('HTTPS is OFF. It has never been switched on in this copy of the');
    console.log('project — there is no certificate and no app is pointed at one.');
    console.log('\n  This is not a fault. Run the one command that turns it on:');
    console.log('\n      npm run ssl:dev');
    console.log('\n  then restart `npm run dev`. If ssl:dev prints an error, send me');
    console.log('  that error — it is the thing standing in the way.');
  } else if (!haveCert) {
    console.log('HTTPS is half on: the .env files point at a certificate that is');
    console.log('not there. Most likely server/certs was deleted after switching on.');
    console.log('\n      npm run ssl:dev');
  } else if (!configured.length) {
    console.log('HTTPS is half on: the certificate exists but no .env points at it.');
    console.log('\n      npm run ssl:dev');
  } else if (broken.length) {
    console.log(`HTTPS is half on: ${broken.join(' and ')} point at a file that is not there.`);
    console.log('\n      rm -rf server/certs   (Windows: rmdir /s server\\certs)');
    console.log('      npm run ssl:dev');
  } else if (configured.length < apps.length) {
    const rest = apps.filter((a) => !a.configured).map((a) => a.app).join(' and ');
    console.log(`HTTPS is on for some apps but not ${rest}, so those stay on http.`);
    console.log('\n      npm run ssl:dev');
  } else if (isTrusted(process.platform) === false) {
    console.log('HTTPS is on and working — the connection IS encrypted. The browser');
    console.log('says "Not secure" for a different reason: it does not trust who');
    console.log('issued the certificate, because the development root is not in this');
    console.log('machine\'s trust store yet.');
    console.log('\n      npm run ssl:trust');
    console.log('\n  Then quit the browser completely and reopen it.');
  } else {
    console.log('HTTPS is fully configured — all three apps and a certificate that');
    console.log('resolves. If the browser still shows http://, the config is not the');
    console.log('problem: an older dev server is still holding the port.');
    console.log('\n      Windows      Get-Process node | Stop-Process -Force');
    console.log('      macOS/Linux  pkill -f vite; pkill -f "node src/index.js"');
    console.log('\n  Then `npm run dev`, and check the port it prints is the one you');
    console.log('  have open — if it says 5175 rather than 5173, something still has it.');
  }
  console.log('──────────────────────────────────────────────────────────────\n');
};

const status = () => {
  console.log(`Node ${process.version} on ${process.platform}\n`);

  try {
    require('./dev-certificate');
    console.log('✓ the certificate library is installed\n');
  } catch (err) {
    console.log(`✗ the certificate library will not load: ${err.message}`);
    console.log('  → run `npm install` in the project root\n');
  }

  certificateReport();
  Object.entries(ENVS).forEach(([app, file]) => appReport(app, file));
  verdict();
};

const main = async () => {
  const args = process.argv.slice(2);
  const off = args.some((arg) => /^(--)?off$/.test(arg));

  if (args.some((arg) => /^(--)?status$/.test(arg))) {
    console.log('\nFresh Meat Nepal — local HTTPS status\n');
    return status();
  }

  if (args.some((arg) => /^(--)?untrust$/.test(arg))) {
    console.log('\nFresh Meat Nepal — removing the local development root\n');
    return trust(true);
  }
  if (args.some((arg) => /^(--)?trust$/.test(arg))) {
    console.log('\nFresh Meat Nepal — trusting the local development root\n');
    return trust(false);
  }

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
