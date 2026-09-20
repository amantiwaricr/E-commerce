'use strict';

const crypto = require('crypto');

const integrity = require('../src/services/integrity.service');
const { canonicalise, digestOf, buildEntry, appendEntry, verifyLedger, placementFacts } = integrity;

/** A key for this suite, installed the way the environment would supply it. */
const installKey = (keyId = 'test-key') => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  process.env.TXN_SIGNING_KEY_ID = keyId;
  process.env.TXN_SIGNING_KEY = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    'utf8'
  ).toString('base64');
  delete process.env.TXN_VERIFY_KEYS;
  jest.resetModules();
  return privateKey;
};

/* env.js reads process.env once at require time, so the module registry has to
   be rebuilt whenever this suite changes the key. */
const freshIntegrity = () => {
  jest.resetModules();
  return require('../src/services/integrity.service');
};

const ORDER = () => ({
  orderNumber: 'FMN-2026-00184',
  user: '65f0000000000000000000aa',
  items: [
    { product: '65f0000000000000000000b1', name: 'Goat curry cut', price: 1450, quantity: 2, subtotal: 2900 },
    { product: '65f0000000000000000000b2', name: 'Buff mince', price: 690, quantity: 1, subtotal: 690 },
  ],
  itemsTotal: 3590,
  deliveryCharge: 0,
  totalAmount: 3590,
  paymentMethod: 'esewa',
  deliveryMethod: 'standard',
  shippingAddress: { street: 'Balkumari Chowk', city: 'Lalitpur', phone: '9801234567' },
});

describe('canonicalise', () => {
  it('gives the same bytes whatever order the keys arrive in', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
    expect(canonicalise({ a: { y: 1, x: 2 } })).toBe(canonicalise({ a: { x: 2, y: 1 } }));
  });

  it('keeps array order, because order is a fact about a list', () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('writes a Date as its ISO string, so a round trip through the database matches', () => {
    const iso = '2026-09-20T10:30:00.000Z';
    expect(canonicalise(new Date(iso))).toBe(JSON.stringify(iso));
  });

  it('treats an ObjectId as its string form', () => {
    class ObjectId {
      constructor(v) { this.v = v; }
      toString() { return this.v; }
    }
    expect(canonicalise(new ObjectId('65f0000000000000000000aa'))).toBe('"65f0000000000000000000aa"');
  });

  it('drops undefined but keeps null — an absent field is not a null one', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe(canonicalise({ a: 1 }));
    expect(canonicalise({ a: 1, b: null })).not.toBe(canonicalise({ a: 1 }));
  });

  it('refuses a non-finite number rather than hashing it as null', () => {
    expect(() => canonicalise({ amount: NaN })).toThrow(/non-finite/);
    expect(() => canonicalise({ amount: Infinity })).toThrow(/non-finite/);
  });

  it('refuses an invalid Date', () => {
    expect(() => canonicalise(new Date('nonsense'))).toThrow(/invalid Date/);
  });

  it('does not confuse -0 with 0', () => {
    expect(canonicalise({ amount: -0 })).toBe(canonicalise({ amount: 0 }));
  });

  /* The digest must not depend on how a value happens to be spelled. */
  it('distinguishes the string "1" from the number 1', () => {
    expect(canonicalise({ a: '1' })).not.toBe(canonicalise({ a: 1 }));
  });

  it('cannot be fooled by a key that looks like a separator', () => {
    // A naive "k=v,k=v" scheme collides here; a JSON-shaped one does not.
    expect(canonicalise({ a: 'x,b=y' })).not.toBe(canonicalise({ a: 'x', b: 'y' }));
  });
});

describe('digestOf', () => {
  it('is a sha256 hex digest', () => {
    expect(digestOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a single rupee changes', () => {
    expect(digestOf({ total: 3590 })).not.toBe(digestOf({ total: 3591 }));
  });

  it('is stable across key order, so an honest re-read still verifies', () => {
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 }));
  });
});

describe('the signed, chained ledger', () => {
  let svc;
  beforeEach(() => {
    installKey();
    svc = freshIntegrity();
  });

  const placedOrder = () => {
    const order = ORDER();
    order.ledger = [];
    svc.appendEntry(order, { type: 'order.placed', data: svc.placementFacts(order) });
    return order;
  };

  it('verifies an untouched ledger', () => {
    const report = svc.verifyLedger(placedOrder());
    expect(report.valid).toBe(true);
    expect(report.signed).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.tipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chains each entry to the one before it', () => {
    const order = placedOrder();
    svc.appendEntry(order, { type: 'payment.settled', data: { orderNumber: order.orderNumber, amount: 3590 } });

    expect(order.ledger).toHaveLength(2);
    expect(order.ledger[1].prevHash).toBe(order.ledger[0].hash);
    expect(order.ledger[1].seq).toBe(1);
    expect(svc.verifyLedger(order).valid).toBe(true);
  });

  it('commits the first entry to an empty predecessor', () => {
    expect(placedOrder().ledger[0].prevHash).toBe('');
  });

  it('refuses an event type it does not know', () => {
    expect(() => svc.buildEntry({ type: 'order.free-meat', data: {} })).toThrow(/Unknown ledger event/);
  });

  /* ── the attacks ─────────────────────────────────────────────────────── */

  it('catches an edited amount', () => {
    const order = placedOrder();
    order.ledger[0].data.totalAmount = 1;

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/do not match its hash/);
  });

  it('catches an edited amount even when the hash is recomputed to match', () => {
    const order = placedOrder();
    order.ledger[0].data.totalAmount = 1;
    // What someone with database access would obviously try next.
    order.ledger[0].hash = svc.digestOf({
      seq: order.ledger[0].seq,
      type: order.ledger[0].type,
      at: order.ledger[0].at,
      data: order.ledger[0].data,
      prevHash: order.ledger[0].prevHash,
    });

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    // The hash now agrees with the data; only the signature gives it away.
    expect(report.problems.join(' ')).toMatch(/signature does not verify/);
    expect(report.problems.join(' ')).not.toMatch(/do not match its hash/);
  });

  it('catches a deleted entry', () => {
    const order = placedOrder();
    svc.appendEntry(order, { type: 'payment.settled', data: { amount: 3590 } });
    svc.appendEntry(order, { type: 'order.cancelled', data: { reason: 'changed mind' } });

    order.ledger.splice(1, 1); // remove the payment

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/removed, inserted or reordered/);
  });

  it('catches an inserted entry', () => {
    const order = placedOrder();
    const forged = svc.buildEntry({ type: 'payment.settled', data: { amount: 999999 }, previous: null, seq: 1 });
    order.ledger.push(forged);

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/does not follow entry 0/);
  });

  it('catches two entries swapped', () => {
    const order = placedOrder();
    svc.appendEntry(order, { type: 'payment.settled', data: { amount: 3590 } });
    order.ledger.reverse();

    expect(svc.verifyLedger(order).valid).toBe(false);
  });

  it('catches a stripped signature', () => {
    const order = placedOrder();
    order.ledger[0].signature = '';

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/is not signed/);
  });

  it('catches a signature taken from another order', () => {
    const a = placedOrder();
    const b = ORDER();
    b.orderNumber = 'FMN-2026-00999';
    b.ledger = [];
    svc.appendEntry(b, { type: 'order.placed', data: svc.placementFacts(b) });

    a.ledger[0].signature = b.ledger[0].signature;

    expect(svc.verifyLedger(a).valid).toBe(false);
  });

  it('catches an entry signed by a different key', () => {
    const order = placedOrder();

    // Someone with their own key signs a rewritten entry.
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    order.ledger[0].data.totalAmount = 1;
    const body = {
      seq: order.ledger[0].seq,
      type: order.ledger[0].type,
      at: order.ledger[0].at,
      data: order.ledger[0].data,
      prevHash: order.ledger[0].prevHash,
    };
    order.ledger[0].hash = svc.digestOf(body);
    order.ledger[0].signature = crypto
      .sign(null, Buffer.from(order.ledger[0].hash, 'hex'), privateKey)
      .toString('base64');

    const report = svc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/signature does not verify/);
  });

  it('reports an empty ledger as unverifiable rather than valid', () => {
    const report = svc.verifyLedger({ ledger: [] });
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/no ledger entries/);
  });

  it('lists every problem, not just the first', () => {
    const order = placedOrder();
    svc.appendEntry(order, { type: 'payment.settled', data: { amount: 3590 } });
    order.ledger[0].data.totalAmount = 1;
    order.ledger[1].signature = '';

    expect(svc.verifyLedger(order).problems.length).toBeGreaterThan(1);
  });
});

describe('key handling', () => {
  afterEach(() => {
    delete process.env.TXN_SIGNING_KEY;
    delete process.env.TXN_SIGNING_KEY_ID;
    delete process.env.TXN_VERIFY_KEYS;
    jest.resetModules();
  });

  it('still hashes and chains when no key is configured, but says it is unsigned', () => {
    delete process.env.TXN_SIGNING_KEY;
    delete process.env.TXN_SIGNING_KEY_ID;
    jest.resetModules();
    const svc = require('../src/services/integrity.service');

    const order = { ...ORDER(), ledger: [] };
    svc.appendEntry(order, { type: 'order.placed', data: svc.placementFacts(order) });

    expect(order.ledger[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(order.ledger[0].signature).toBe('');
    expect(order.ledger[0].alg).toBe('none');

    const report = svc.verifyLedger(order);
    expect(report.signed).toBe(false);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/is not signed/);
  });

  it('verifies entries signed by a retired key after a rotation', () => {
    // Sign under the old key.
    installKey('key-2025');
    const oldSvc = freshIntegrity();
    const order = { ...ORDER(), ledger: [] };
    oldSvc.appendEntry(order, { type: 'order.placed', data: oldSvc.placementFacts(order) });

    const retiredPublic = crypto
      .createPublicKey(Buffer.from(process.env.TXN_SIGNING_KEY, 'base64').toString('utf8'))
      .export({ type: 'spki', format: 'pem' });

    // Rotate: new signing key, old public half kept for verification.
    installKey('key-2026');
    process.env.TXN_VERIFY_KEYS = JSON.stringify({
      'key-2025': Buffer.from(retiredPublic, 'utf8').toString('base64'),
    });
    jest.resetModules();
    const newSvc = require('../src/services/integrity.service');

    expect(newSvc.verifyLedger(order).valid).toBe(true);
  });

  it('says which key is missing when a rotation loses one', () => {
    installKey('key-2025');
    const oldSvc = freshIntegrity();
    const order = { ...ORDER(), ledger: [] };
    oldSvc.appendEntry(order, { type: 'order.placed', data: oldSvc.placementFacts(order) });

    installKey('key-2026'); // no TXN_VERIFY_KEYS this time
    const newSvc = freshIntegrity();

    const report = newSvc.verifyLedger(order);
    expect(report.valid).toBe(false);
    expect(report.problems.join(' ')).toMatch(/unknown key "key-2025"/);
  });

  it('refuses a private key of the wrong type rather than signing with it', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.TXN_SIGNING_KEY_ID = 'rsa-key';
    process.env.TXN_SIGNING_KEY = Buffer.from(
      privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8'
    ).toString('base64');
    jest.resetModules();
    const svc = require('../src/services/integrity.service');

    expect(svc.loadKeyring().canSign).toBe(false);
  });
});

describe('what an entry commits to', () => {
  it('leaves out the status and timeline, which change legitimately', () => {
    const facts = placementFacts({ ...ORDER(), orderStatus: 'pending', trackingInfo: { timeline: [1, 2] } });
    expect(facts).not.toHaveProperty('orderStatus');
    expect(facts).not.toHaveProperty('trackingInfo');
  });

  it('covers every amount that decides what is owed', () => {
    const facts = placementFacts(ORDER());
    expect(facts).toMatchObject({ itemsTotal: 3590, deliveryCharge: 0, totalAmount: 3590, currency: 'NPR' });
    expect(facts.items).toHaveLength(2);
    expect(facts.items[0]).toMatchObject({ price: 1450, quantity: 2, subtotal: 2900 });
  });

  it('commits to the address as a digest, not in the clear', () => {
    const order = ORDER();
    const facts = placementFacts(order);
    expect(facts.shippingAddressHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(facts)).not.toMatch(/Balkumari|9801234567/);
  });

  it('notices a changed address through that digest', () => {
    const a = placementFacts(ORDER());
    const moved = ORDER();
    moved.shippingAddress.street = 'Somewhere else';
    expect(placementFacts(moved).shippingAddressHash).not.toBe(a.shippingAddressHash);
  });
});
