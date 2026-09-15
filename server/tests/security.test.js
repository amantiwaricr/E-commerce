'use strict';

const { tlsOptionsFor, isLocalUri, declaresTls, hostsOf } = require('../src/utils/mongoTls');
const { deriveKey, keyFor, isValidClientKey, WINDOW_MS } = require('../src/utils/idempotency');
const { isSecureRequest } = require('../src/middleware/https');

describe('MongoDB TLS selection', () => {
  it('reads every host out of a connection string', () => {
    expect(hostsOf('mongodb://user:pw@a.example.com:27017,b.example.com:27018/db?x=1')).toEqual([
      'a.example.com',
      'b.example.com',
    ]);
  });

  it('is not fooled by an @ inside the password', () => {
    expect(hostsOf('mongodb://user:p@ss@db.example.com:27017/x')).toEqual(['db.example.com']);
  });

  it('leaves a local database alone', () => {
    expect(isLocalUri('mongodb://127.0.0.1:27017/fmn')).toBe(true);
    expect(tlsOptionsFor('mongodb://127.0.0.1:27017/fmn')).toEqual({});
    expect(tlsOptionsFor('mongodb://localhost/fmn')).toEqual({});
  });

  it('turns TLS on for a remote host reached over plain mongodb://', () => {
    expect(tlsOptionsFor('mongodb://user:pw@db.example.com:27017/fmn')).toEqual({ tls: true });
  });

  it('treats a replica set as remote unless every member is local', () => {
    expect(isLocalUri('mongodb://127.0.0.1:1,db.example.com:2/x')).toBe(false);
    expect(tlsOptionsFor('mongodb://127.0.0.1:1,db.example.com:2/x')).toEqual({ tls: true });
  });

  it('leaves mongodb+srv alone — it is TLS by definition', () => {
    expect(tlsOptionsFor('mongodb+srv://user:pw@cluster.mongodb.net/fmn')).toEqual({});
  });

  it('defers to an explicit choice in the URI', () => {
    expect(declaresTls('mongodb://db.example.com/x?tls=false')).toBe(true);
    expect(tlsOptionsFor('mongodb://db.example.com/x?tls=false')).toEqual({});
    expect(tlsOptionsFor('mongodb://db.example.com/x?ssl=true')).toEqual({});
  });
});

describe('checkout idempotency', () => {
  const order = {
    userId: 'user-1',
    items: [
      { product: 'p1', quantity: 2 },
      { product: 'p2', quantity: 1 },
    ],
    totalAmount: 3400,
    paymentMethod: 'cod',
    shippingAddress: { street: 'Jhamsikhel 12', city: 'Lalitpur', phone: '9841000000' },
  };
  const now = 1_700_000_000_000;

  it('gives two clicks of the same checkout one key', () => {
    expect(deriveKey({ ...order, now })).toBe(deriveKey({ ...order, now: now + 1500 }));
  });

  it('does not care what order the basket arrives in', () => {
    const reversed = { ...order, items: [...order.items].reverse() };
    expect(deriveKey({ ...order, now })).toBe(deriveKey({ ...reversed, now }));
  });

  it('normalises the address, so casing and spacing do not split the key', () => {
    const messy = { ...order, shippingAddress: { street: '  JHAMSIKHEL 12 ', city: 'Lalitpur', phone: '9841000000' } };
    expect(deriveKey({ ...order, now })).toBe(deriveKey({ ...messy, now }));
  });

  it('separates a genuinely different order', () => {
    expect(deriveKey({ ...order, now })).not.toBe(deriveKey({ ...order, totalAmount: 3500, now }));
    expect(deriveKey({ ...order, now })).not.toBe(deriveKey({ ...order, paymentMethod: 'esewa', now }));
    expect(deriveKey({ ...order, now })).not.toBe(deriveKey({ ...order, userId: 'user-2', now }));
    expect(deriveKey({ ...order, now })).not.toBe(
      deriveKey({ ...order, items: [{ product: 'p1', quantity: 3 }, order.items[1]], now })
    );
  });

  it('lets the same basket be ordered again later', () => {
    expect(deriveKey({ ...order, now })).not.toBe(deriveKey({ ...order, now: now + 2 * WINDOW_MS }));
  });

  it('accepts a client key only in a shape safe to index', () => {
    expect(isValidClientKey('a1b2c3d4')).toBe(true);
    expect(isValidClientKey('short')).toBe(false);
    expect(isValidClientKey('has spaces in it')).toBe(false);
    expect(isValidClientKey('x'.repeat(200))).toBe(false);
    expect(isValidClientKey(undefined)).toBe(false);
  });

  it('prefers the client key, and falls back when it is unusable', () => {
    const req = (key) => ({ headers: key === undefined ? {} : { 'idempotency-key': key } });
    expect(keyFor(req('checkout-abc-123'), order)).toBe('c_checkout-abc-123');
    expect(keyFor(req('nope'), order).startsWith('d_')).toBe(true);
    expect(keyFor(req(undefined), order).startsWith('d_')).toBe(true);
  });

  it('keeps client and derived keys in separate namespaces', () => {
    const derived = deriveKey({ ...order, now });
    expect(keyFor({ headers: { 'idempotency-key': derived } }, order)).toBe(`c_${derived}`);
  });
});

describe('HTTPS detection', () => {
  const req = (secure, header) => ({ secure, get: (name) => (name === 'x-forwarded-proto' ? header : undefined) });

  it('trusts the socket when TLS terminates here', () => {
    expect(isSecureRequest(req(true, undefined))).toBe(true);
  });

  it('trusts the proxy header when TLS terminates in front', () => {
    expect(isSecureRequest(req(false, 'https'))).toBe(true);
  });

  it('calls plain HTTP what it is', () => {
    expect(isSecureRequest(req(false, 'http'))).toBe(false);
    expect(isSecureRequest(req(false, undefined))).toBe(false);
  });
});
