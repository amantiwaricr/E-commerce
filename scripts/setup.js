#!/usr/bin/env node
'use strict';

/**
 * Interactive first-run setup.
 *
 *   npm run setup
 *   npm run setup -- --admin-email=me@gmail.com --admin-password=secret123 --port=5001
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

/** The keys an env file actually defines, ignoring comments and blanks. */
const keysIn = (content) =>
  new Set(
    content
      .split('\n')
      .map((line) => (line.match(/^\s*([A-Z0-9_]+)\s*=/) || [])[1])
      .filter(Boolean)
  );

/**
 * Adds any key the example defines but the live file is missing, keeping the
 * values already set. An .env that was emptied, truncated or written by hand
 * before a new key existed is repaired rather than silently left broken.
 */
const backfillFromExample = (target) => {
  const example = fs.readFileSync(`${target}.example`, 'utf8');
  const current = fs.readFileSync(target, 'utf8');
  const have = keysIn(current);

  const missing = example
    .split('\n')
    .filter((line) => {
      const key = (line.match(/^\s*([A-Z0-9_]+)\s*=/) || [])[1];
      return key && !have.has(key);
    });

  if (!missing.length) return 0;

  const block = ['', '# Added by `npm run setup` — values from .env.example', ...missing, ''].join('\n');
  fs.writeFileSync(target, `${current.trimEnd()}\n${block}`);
  return missing.length;
};

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

  // Repair files that exist but are missing keys.
  [[SERVER_ENV, 'server/.env'], [CLIENT_ENV, 'client/.env'], [ADMIN_ENV, 'admin/.env']].forEach(([file, label]) => {
    const added = backfillFromExample(file);
    if (added) console.log(`✓ ${label}: restored ${added} missing setting${added === 1 ? '' : 's'} from the example`);
  });

  let adminEmail = arg('admin-email');
  let adminPassword = arg('admin-password');
  let port = arg('port');

  const needsPrompting = adminEmail === undefined && adminPassword === undefined && port === undefined;

  if (needsPrompting) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\nPress Enter to skip any question and leave that value unchanged.\n');

    adminEmail = await ask(rl, 'Email address for the store admin account: ', {
      validate: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    });
    adminPassword = await ask(rl, 'Password for that admin account (min 8 chars): ', {
      validate: (v) => v.length >= 8,
    });
    port = await ask(rl, 'API port [5000]: ', { validate: (v) => /^\d{2,5}$/.test(v) });

    rl.close();
  }

  let server = fs.readFileSync(SERVER_ENV, 'utf8');
  let client = fs.readFileSync(CLIENT_ENV, 'utf8');
  let admin = fs.readFileSync(ADMIN_ENV, 'utf8');

  if (adminEmail) {
    server = setEnvValue(server, 'SEED_ADMIN_EMAIL', adminEmail);
  }
  if (adminPassword) {
    server = setEnvValue(server, 'SEED_ADMIN_PASSWORD', adminPassword);
  }
  // No port given? Keep the apps pointed at whatever the server is already set
  // to, so a restored file cannot drift from a customised PORT.
  if (!port) {
    const existing = (server.match(/^PORT=(\d+)$/m) || [])[1];
    const clientPort = (client.match(/^VITE_API_URL=.*?:(\d+)/m) || [])[1];
    if (existing && existing !== clientPort) {
      client = setEnvValue(client, 'VITE_API_URL', `http://localhost:${existing}/api`);
      admin = setEnvValue(admin, 'VITE_API_URL', `http://localhost:${existing}/api`);
      server = setEnvValue(server, 'BACKEND_URL', `http://localhost:${existing}`);
      console.log(`  · pointed the apps at the API port already set in server/.env (${existing})`);
    }
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
  if (adminEmail) console.log(`  · ${adminEmail} will be the store admin after seeding`);
  if (adminPassword) console.log('  · admin password set (used by `npm run seed`)');
  if (port) console.log(`  · API port set to ${port}`);

  if (!server.match(/^SMTP_HOST=\S+/m)) {
    console.log('\n⚠️  SMTP is not configured, so verification emails cannot be sent.');
    console.log('   Sign-up still works locally: the 4-digit code is printed in the server');
    console.log('   terminal and shown on the verification screen. Fill in SMTP_* in');
    console.log('   server/.env to email codes for real.');
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
