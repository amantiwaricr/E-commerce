#!/usr/bin/env node
'use strict';

/**
 * Interactive first-run setup.
 *
 *   npm run setup
 *   npm run setup -- --google-client-id=123-abc.apps.googleusercontent.com --admin-email=me@gmail.com --port=5001
 *
 * Creates server/.env and client/.env from their examples if missing, then
 * writes the handful of values that cannot be defaulted — keeping the Google
 * client ID identical on both sides, which is the easiest thing to get wrong.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SERVER_ENV = path.join(ROOT, 'server', '.env');
const CLIENT_ENV = path.join(ROOT, 'client', '.env');
const ADMIN_ENV = path.join(ROOT, 'admin', '.env');

const GOOGLE_ID_SUFFIX = '.apps.googleusercontent.com';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

/** Replaces `KEY=…` in place, or appends it when the key is absent. */
const setEnvValue = (content, key, value) => {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
};

const ensureEnvFile = (target) => {
  if (fs.existsSync(target)) return false;
  fs.copyFileSync(`${target}.example`, target);
  return true;
};

const isValidGoogleId = (value) =>
  value.endsWith(GOOGLE_ID_SUFFIX) && !value.startsWith('your-') && value.length > GOOGLE_ID_SUFFIX.length;

const ask = (rl, question, { validate, allowBlank = true } = {}) =>
  new Promise((resolve) => {
    const prompt = () =>
      rl.question(question, (answer) => {
        const value = answer.trim();
        if (!value && allowBlank) return resolve('');
        if (validate && !validate(value)) {
          console.log('   ↳ That does not look right — try again, or press Enter to skip.\n');
          return prompt();
        }
        return resolve(value);
      });
    prompt();
  });

const main = async () => {
  console.log('\nFresh Meat Nepal — setup\n');

  const created = [
    ensureEnvFile(SERVER_ENV) && 'server/.env',
    ensureEnvFile(CLIENT_ENV) && 'client/.env',
    ensureEnvFile(ADMIN_ENV) && 'admin/.env',
  ].filter(Boolean);
  created.forEach((file) => console.log(`✓ created ${file} from its example`));

  let googleClientId = arg('google-client-id');
  let adminEmail = arg('admin-email');
  let port = arg('port');

  const needsPrompting = googleClientId === undefined && adminEmail === undefined && port === undefined;

  if (needsPrompting) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\nPress Enter to skip any question and leave that value unchanged.\n');
    console.log('Google OAuth client ID — create one at https://console.cloud.google.com');
    console.log('  Credentials → OAuth client ID → Web application');
    console.log('  Authorised JavaScript origins: http://localhost:5173  AND  http://localhost:5174');
    console.log('  (the storefront and the admin panel are separate apps)\n');

    googleClientId = await ask(rl, 'Google client ID: ', { validate: isValidGoogleId });
    adminEmail = await ask(rl, 'Your Gmail address (becomes the store admin): ');
    port = await ask(rl, 'API port [5000]: ', { validate: (v) => /^\d{2,5}$/.test(v) });

    rl.close();
  }

  if (googleClientId && !isValidGoogleId(googleClientId)) {
    console.error(`\n✗ "${googleClientId}" is not a valid Google client ID (must end in ${GOOGLE_ID_SUFFIX}).`);
    process.exit(1);
  }

  let server = fs.readFileSync(SERVER_ENV, 'utf8');
  let client = fs.readFileSync(CLIENT_ENV, 'utf8');
  let admin = fs.readFileSync(ADMIN_ENV, 'utf8');

  if (googleClientId) {
    // The same value on both sides: the server verifies tokens against it.
    server = setEnvValue(server, 'GOOGLE_CLIENT_ID', googleClientId);
    client = setEnvValue(client, 'VITE_GOOGLE_CLIENT_ID', googleClientId);
    admin = setEnvValue(admin, 'VITE_GOOGLE_CLIENT_ID', googleClientId);
    // Real sign-in is available, so the local escape hatch is not needed.
    server = setEnvValue(server, 'ENABLE_DEV_LOGIN', 'false');
  } else {
    // Without OAuth there is no way in at all — enable the development login so
    // the app is usable, and say so loudly.
    server = setEnvValue(server, 'ENABLE_DEV_LOGIN', 'true');
  }
  if (adminEmail) {
    server = setEnvValue(server, 'SEED_ADMIN_EMAIL', adminEmail);
  }
  if (port) {
    server = setEnvValue(server, 'PORT', port);
    server = setEnvValue(server, 'BACKEND_URL', `http://localhost:${port}`);
    client = setEnvValue(client, 'VITE_API_URL', `http://localhost:${port}/api`);
    admin = setEnvValue(admin, 'VITE_API_URL', `http://localhost:${port}/api`);
  }

  fs.writeFileSync(SERVER_ENV, server);
  fs.writeFileSync(CLIENT_ENV, client);
  fs.writeFileSync(ADMIN_ENV, admin);

  console.log('\n✓ server/.env, client/.env and admin/.env updated');
  if (googleClientId) console.log('  · Google client ID written to all three files');
  if (adminEmail) console.log(`  · ${adminEmail} will be the store admin after seeding`);
  if (port) console.log(`  · API port set to ${port}`);

  if (googleClientId) {
    console.log('  · development login disabled (real Google sign-in is configured)');
  } else {
    console.log('\n⚠️  No Google client ID set, so ENABLE_DEV_LOGIN=true was written to server/.env.');
    console.log('   The sign-in page will offer "Continue without Google (development only)",');
    console.log('   which signs you in as the seeded admin. It is refused when NODE_ENV=production.');
    console.log('   Re-run `npm run setup` with a client ID to switch to real Google sign-in.');
  }

  console.log('\nNext:');
  console.log('  npm run seed');
  console.log('  npm run dev');
  console.log('  → storefront    http://localhost:5173');
  console.log('  → admin panel   http://localhost:5174\n');
};

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
