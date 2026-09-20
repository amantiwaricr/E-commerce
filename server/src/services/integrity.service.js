'use strict';

/**
 * Tamper-evidence for money movements.
 *
 * Every financially material event on an order — placed, paid, failed,
 * cancelled, refunded — is appended to a per-order ledger as a hash-chained,
 * digitally signed entry. Three separate properties come out of that, and it is
 * worth being precise about which mechanism provides which, because they are
 * routinely conflated:
 *
 *   Hash (SHA-256)     detects a changed entry. Recompute the digest over the
 *                      entry's own contents; a single altered rupee changes it.
 *
 *   Chain (prevHash)   detects a deleted, inserted or reordered entry. Each
 *                      entry commits to the one before it, so the tail digest
 *                      covers the entire history, not just the last event.
 *
 *   Signature (Ed25519) detects a *rewritten* history. Hashes alone protect
 *                      nothing against someone who can write to the database:
 *                      they would simply recompute the chain. A signature
 *                      cannot be recomputed without the private key, which the
 *                      database has never held.
 *
 * Ed25519 rather than RSA or ECDSA: no curve or padding to choose wrongly, no
 * per-signature randomness to leak a key through, 64-byte signatures, and it is
 * in Node's standard library.
 *
 * HMAC would have been the smaller change — the eSewa integration already uses
 * one — but a shared secret cannot answer "did this server issue this record?"
 * to anyone except the holder of the secret, who could equally have forged it.
 * Only a public key lets an auditor, a customer or a court verify a receipt
 * without also being able to produce one.
 */

const crypto = require('crypto');

const { env } = require('../config/env');
const logger = require('../utils/logger');

const HASH_ALGORITHM = 'sha256';
const SIGNATURE_ALGORITHM = 'ed25519';

/** The event types the ledger records. Anything touching money belongs here. */
const LEDGER_EVENTS = [
  'order.placed',
  'payment.settled',
  'payment.failed',
  'order.cancelled',
  'order.refunded',
];

/* ── canonical form ──────────────────────────────────────────────────────── */

/**
 * Serialises a value so the same facts always produce the same bytes.
 *
 * `JSON.stringify` is not enough: it preserves key insertion order, and a
 * document read back from MongoDB does not promise the order it was written
 * in. Two honest servers would then compute two different digests for one
 * unchanged order, and every verification would fail for the wrong reason.
 *
 * So: object keys sorted, arrays left in their meaningful order, dates as ISO
 * strings, ObjectIds and Buffers as strings, `undefined` dropped the way
 * JSON.stringify drops it, and `null` kept — it is a value, not an absence.
 *
 * Non-finite numbers throw rather than serialise. NaN would become `null` and
 * quietly hash the same as a missing amount.
 */
const canonicalise = (value) => {
  if (value === null) return 'null';

  const type = typeof value;

  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot canonicalise a non-finite number: ${value}`);
    // Object.is separates -0 from 0; they are the same amount of money.
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'bigint') return JSON.stringify(value.toString());

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Cannot canonicalise an invalid Date');
    return JSON.stringify(value.toISOString());
  }
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));

  // A Mongoose ObjectId, a Decimal128, or anything else that knows its own
  // stable string form. Checked before the plain-object branch, since an
  // ObjectId enumerates as its internal buffer.
  if (type === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
    return JSON.stringify(value.toString());
  }

  if (Array.isArray(value)) return `[${value.map((item) => canonicalise(item === undefined ? null : item)).join(',')}]`;

  if (type === 'object') {
    // A Mongoose subdocument carries methods and internals; take its plain form.
    const plain = typeof value.toObject === 'function' ? value.toObject() : value;

    const pairs = Object.keys(plain)
      .sort()
      .filter((key) => plain[key] !== undefined && typeof plain[key] !== 'function')
      .map((key) => `${JSON.stringify(key)}:${canonicalise(plain[key])}`);

    return `{${pairs.join(',')}}`;
  }

  throw new TypeError(`Cannot canonicalise a value of type ${type}`);
};

/** SHA-256 of the canonical form, hex encoded. */
const digestOf = (value) =>
  crypto.createHash(HASH_ALGORITHM).update(canonicalise(value), 'utf8').digest('hex');

/* ── keys ────────────────────────────────────────────────────────────────── */

/**
 * The signing key, and every public key needed to verify what was signed
 * before it.
 *
 * Rotation is why the keyring is a map rather than a single key: an entry
 * signed last year must still verify after the key changes, so each entry
 * records the `keyId` it was signed with and verification looks that one up.
 * A rotated-out private key is destroyed; its public half stays here forever.
 */
let keyringCache = null;

const decodePem = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  // A PEM block survives an .env file badly — newlines do not. Accept base64 of
  // the whole PEM, and accept the literal "\n" that a .env quoting mishap
  // leaves behind.
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');
  return Buffer.from(value, 'base64').toString('utf8');
};

const loadKeyring = () => {
  if (keyringCache) return keyringCache;

  const keyId = env.txnSigning.keyId;
  const privatePem = decodePem(env.txnSigning.privateKey);

  const publicKeys = {};
  for (const [id, pem] of Object.entries(env.txnSigning.publicKeys || {})) {
    try {
      publicKeys[id] = crypto.createPublicKey(decodePem(pem));
    } catch (err) {
      logger.error(`Retired signing key "${id}" could not be loaded: ${err.message}`);
    }
  }

  let privateKey = null;
  if (privatePem) {
    try {
      privateKey = crypto.createPrivateKey(privatePem);
      if (privateKey.asymmetricKeyType !== SIGNATURE_ALGORITHM) {
        throw new Error(`expected an ${SIGNATURE_ALGORITHM} key, got ${privateKey.asymmetricKeyType}`);
      }
      // Derived rather than configured twice: a public key that does not match
      // its private half would fail every verification, silently.
      publicKeys[keyId] = crypto.createPublicKey(privateKey);
    } catch (err) {
      logger.error(`TXN_SIGNING_KEY could not be loaded, so the ledger will not be signed: ${err.message}`);
      privateKey = null;
    }
  }

  keyringCache = { keyId, privateKey, publicKeys, canSign: Boolean(privateKey) };
  return keyringCache;
};

/** Tests and key rotation change the environment underneath the cache. */
const resetKeyring = () => {
  keyringCache = null;
};

/* ── entries ─────────────────────────────────────────────────────────────── */

/**
 * The bytes an entry commits to.
 *
 * `signature` and `keyId` are deliberately outside it: a signature cannot cover
 * itself, and the key that produced it is what you need in order to check it.
 */
const entryBody = (entry) => ({
  seq: entry.seq,
  type: entry.type,
  at: entry.at,
  data: entry.data,
  prevHash: entry.prevHash,
});

/**
 * Builds the next entry for a ledger, chained to the one before it.
 *
 * @param previous the last entry, or null/undefined for the first
 * @returns a plain entry ready to push onto `order.ledger`
 */
const buildEntry = ({ type, data, at = new Date(), previous = null, seq = null }) => {
  if (!LEDGER_EVENTS.includes(type)) throw new TypeError(`Unknown ledger event type: ${type}`);

  const body = {
    seq: seq === null ? (previous ? previous.seq + 1 : 0) : seq,
    type,
    at,
    data,
    // The genesis entry commits to the empty string, so "no previous entry" is
    // itself part of what is hashed and cannot be claimed later.
    prevHash: previous ? previous.hash : '',
  };

  const hash = digestOf(body);
  const { privateKey, keyId, canSign } = loadKeyring();

  return {
    ...body,
    hash,
    alg: canSign ? SIGNATURE_ALGORITHM : 'none',
    keyId: canSign ? keyId : '',
    // Signed over the digest's own bytes: the hash already commits to
    // everything, and Ed25519 signs a short fixed-length message either way.
    signature: canSign ? crypto.sign(null, Buffer.from(hash, 'hex'), privateKey).toString('base64') : '',
  };
};

/** Appends an entry to a Mongoose order document without saving it. */
const appendEntry = (order, { type, data, at = new Date() }) => {
  const ledger = order.ledger || [];
  const entry = buildEntry({ type, data, at, previous: ledger.length ? ledger[ledger.length - 1] : null });
  ledger.push(entry);
  order.ledger = ledger;
  return entry;
};

/* ── verification ────────────────────────────────────────────────────────── */

/**
 * Re-derives every digest, checks every link, and verifies every signature.
 *
 * Reports each failure rather than stopping at the first: "entry 2's amount was
 * edited and entry 3 was deleted" is a different incident from either alone,
 * and an auditor needs the whole picture.
 */
const verifyLedger = (order) => {
  const ledger = (order?.ledger || []).map((entry) => (typeof entry.toObject === 'function' ? entry.toObject() : entry));
  const { publicKeys } = loadKeyring();
  const problems = [];

  if (!ledger.length) {
    return { valid: false, signed: false, entries: 0, tipHash: '', problems: ['This order has no ledger entries.'] };
  }

  let signedCount = 0;

  ledger.forEach((entry, index) => {
    const where = `entry ${index} (${entry.type || 'unknown'})`;

    if (entry.seq !== index) problems.push(`${where}: sequence number is ${entry.seq}, expected ${index}.`);

    let recomputed;
    try {
      recomputed = digestOf(entryBody(entry));
    } catch (err) {
      problems.push(`${where}: contents cannot be hashed — ${err.message}`);
      return;
    }

    if (recomputed !== entry.hash) problems.push(`${where}: contents do not match its hash — it was altered.`);

    const expectedPrev = index === 0 ? '' : ledger[index - 1].hash;
    if (entry.prevHash !== expectedPrev) {
      problems.push(
        index === 0
          ? `${where}: claims a predecessor, but it is the first entry.`
          : `${where}: does not follow entry ${index - 1} — an entry was removed, inserted or reordered.`
      );
    }

    if (!entry.signature) {
      problems.push(`${where}: is not signed, so its origin cannot be established.`);
      return;
    }

    const key = publicKeys[entry.keyId];
    if (!key) {
      problems.push(`${where}: signed with unknown key "${entry.keyId}" — add its public half to TXN_VERIFY_KEYS.`);
      return;
    }

    let ok = false;
    try {
      // Verified against the RECOMPUTED digest, never the stored one. Checking
      // the stored hash would let anyone who edits both the data and the hash
      // present a signature that still matches.
      ok = crypto.verify(null, Buffer.from(recomputed, 'hex'), key, Buffer.from(entry.signature, 'base64'));
    } catch (err) {
      problems.push(`${where}: signature could not be checked — ${err.message}`);
      return;
    }

    if (ok) signedCount += 1;
    else problems.push(`${where}: signature does not verify — this entry did not come from this server.`);
  });

  return {
    valid: problems.length === 0,
    signed: signedCount === ledger.length,
    entries: ledger.length,
    tipHash: ledger[ledger.length - 1]?.hash || '',
    problems,
  };
};

/* ── what gets recorded ──────────────────────────────────────────────────── */

/**
 * The financial facts of an order as placed.
 *
 * Deliberately not the whole document: `orderStatus` and the delivery timeline
 * change legitimately as the order moves, and hashing them would make every
 * normal update look like tampering. What is committed here is what cannot
 * change without someone having changed it — who ordered what, at what price,
 * to be paid how.
 */
const placementFacts = (order) => ({
  orderNumber: order.orderNumber,
  user: order.user,
  currency: 'NPR',
  items: (order.items || []).map((item) => ({
    product: item.product,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  })),
  itemsTotal: order.itemsTotal,
  deliveryCharge: order.deliveryCharge,
  totalAmount: order.totalAmount,
  paymentMethod: order.paymentMethod,
  deliveryMethod: order.deliveryMethod,
  // The address is committed as a digest, not in the clear: the ledger is
  // shown to auditors and printed on receipts, and a home address does not
  // need to travel with it to prove the order was not altered.
  shippingAddressHash: order.shippingAddress ? digestOf(order.shippingAddress) : '',
});

const settlementFacts = (order, status = {}) => ({
  orderNumber: order.orderNumber,
  provider: order.payment?.provider || 'esewa',
  transactionUuid: order.payment?.transactionUuid || '',
  referenceId: order.payment?.referenceId || '',
  amount: status.totalAmount ?? order.totalAmount,
  currency: 'NPR',
  paidAt: order.payment?.paidAt || null,
});

module.exports = {
  HASH_ALGORITHM,
  SIGNATURE_ALGORITHM,
  LEDGER_EVENTS,
  canonicalise,
  digestOf,
  buildEntry,
  appendEntry,
  verifyLedger,
  placementFacts,
  settlementFacts,
  loadKeyring,
  resetKeyring,
};
