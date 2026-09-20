#!/usr/bin/env node
'use strict';

/**
 * Generates the Ed25519 key pair that signs the transaction ledger.
 *
 *   npm run keys:txn            create a key and write it into server/.env
 *   npm run keys:txn -- rotate  create a new one, keeping the old public half
 *
 * The private key is written only to server/.env, which is gitignored. Rotation
 * keeps every retired public key in TXN_VERIFY_KEYS so entries signed under the
 * old key still verify — a ledger whose history stops verifying after a routine
 * key change would be worse than no ledger at all.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { readEnvFile, setValues } = require('./env-file');

const ROOT = path.resolve(__dirname, '..');
const ENV = path.join(ROOT, 'server', '.env');

/** Base64 of the whole PEM: a .env file cannot carry real newlines. */
const pack = (pem) => Buffer.from(pem, 'utf8').toString('base64');

const generate = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
};

/** `2026-09-20` — a key id that says when it started being used. */
const newKeyId = () => new Date().toISOString().slice(0, 10);

/**
 * Creates a signing key in `envFile` if there is not one already.
 *
 * Exported so `npm run setup` can do this without anyone having to know the
 * command exists. Never replaces an existing key — that is what rotation is
 * for, and doing it silently would orphan every signature already written.
 *
 * @returns `{ created, keyId }`
 */
const ensureSigningKey = (envFile = ENV) => {
  if (!fs.existsSync(envFile)) return { created: false, keyId: '' };

  const current = (readEnvFile(envFile) || { values: {} }).values;
  if (current.TXN_SIGNING_KEY) return { created: false, keyId: current.TXN_SIGNING_KEY_ID || 'default' };

  const { privatePem } = generate();
  const keyId = newKeyId();
  setValues(envFile, {
    TXN_SIGNING_KEY_ID: keyId,
    TXN_SIGNING_KEY: pack(privatePem),
    TXN_VERIFY_KEYS: current.TXN_VERIFY_KEYS || '{}',
  });

  return { created: true, keyId };
};

const main = () => {
  const rotating = process.argv.slice(2).some((arg) => /^(--)?rotate$/.test(arg));

  if (!fs.existsSync(ENV)) {
    console.error('\nserver/.env does not exist yet. Run `npm run setup` first.\n');
    return process.exit(1);
  }

  const current = readEnvFile(ENV).values;

  if (current.TXN_SIGNING_KEY && !rotating) {
    console.log('\n✓ A transaction signing key is already configured.\n');
    console.log(`  key id: ${current.TXN_SIGNING_KEY_ID || 'default'}`);
    console.log('\n  To replace it, keeping old signatures verifiable:');
    console.log('      npm run keys:txn -- rotate\n');
    return undefined;
  }

  const { privatePem, publicPem } = generate();
  const keyId = newKeyId();

  // Everything already in TXN_VERIFY_KEYS stays, plus the key being retired.
  let verify = {};
  try {
    verify = current.TXN_VERIFY_KEYS ? JSON.parse(current.TXN_VERIFY_KEYS) : {};
  } catch {
    console.error('\n! TXN_VERIFY_KEYS is not valid JSON and will be rebuilt.');
    console.error('  Any key ids it held are lost — entries signed with them will no longer verify.\n');
  }

  // Checked before anything is announced: reusing the id would overwrite the
  // retired key's public half under the same name, and every entry signed with
  // it would stop verifying.
  if (keyId === (current.TXN_SIGNING_KEY_ID || '')) {
    console.error('\nA key was already generated today, so a rotation would reuse its id and');
    console.error('overwrite the retired public key. Set TXN_SIGNING_KEY_ID by hand and re-run.\n');
    return process.exit(1);
  }

  if (rotating && current.TXN_SIGNING_KEY) {
    const retiringId = current.TXN_SIGNING_KEY_ID || 'default';
    try {
      const retiring = crypto.createPrivateKey(Buffer.from(current.TXN_SIGNING_KEY, 'base64').toString('utf8'));
      verify[retiringId] = pack(crypto.createPublicKey(retiring).export({ type: 'spki', format: 'pem' }));
      console.log(`  retired key "${retiringId}" — its public half is kept so old entries still verify`);
    } catch (err) {
      console.error(`\n! The current key could not be read (${err.message}).`);
      console.error('  Entries signed with it will no longer verify.\n');
    }
  }

  setValues(ENV, {
    TXN_SIGNING_KEY_ID: keyId,
    TXN_SIGNING_KEY: pack(privatePem),
    TXN_VERIFY_KEYS: JSON.stringify(verify),
  });

  console.log(`\n✓ ${rotating ? 'Rotated' : 'Generated'} an Ed25519 transaction signing key.\n`);
  console.log(`  key id        ${keyId}`);
  console.log(`  private key   server/.env (gitignored — never commit it)`);
  console.log(`  public key    below; anyone can verify a receipt with it\n`);
  console.log(publicPem.trim().split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('\n  Restart the API for it to take effect.\n');
  return undefined;
};

if (require.main === module) main();

module.exports = { ensureSigningKey };
