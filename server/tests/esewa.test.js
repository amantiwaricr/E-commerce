'use strict';

const crypto = require('crypto');
const esewa = require('../src/services/esewa.service');
const { env } = require('../src/config/env');

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

const signedCallback = (overrides = {}) => {
  const payload = {
    transaction_code: '000AE01',
    status: 'COMPLETE',
    total_amount: '1,100.0',
    transaction_uuid: 'FMN-2601-00001-abcd1234',
    product_code: 'EPAYTEST',
    signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    ...overrides,
  };
  const fields = payload.signed_field_names.split(',');
  payload.signature = esewa.buildSignature(payload, fields);
  return payload;
};

describe('eSewa signature generation', () => {
  it('signs total_amount, transaction_uuid and product_code in the documented order', () => {
    const fields = { total_amount: '100', transaction_uuid: 'abc-123', product_code: 'EPAYTEST' };
    const expected = crypto
      .createHmac('sha256', env.esewa.secretKey)
      .update('total_amount=100,transaction_uuid=abc-123,product_code=EPAYTEST')
      .digest('base64');

    expect(esewa.buildSignature(fields)).toBe(expected);
  });

  it('produces a different signature when the amount changes', () => {
    const a = esewa.buildSignature({ total_amount: '100', transaction_uuid: 'x', product_code: 'EPAYTEST' });
    const b = esewa.buildSignature({ total_amount: '101', transaction_uuid: 'x', product_code: 'EPAYTEST' });
    expect(a).not.toBe(b);
  });
});

describe('eSewa payment form payload', () => {
  it('includes every field eSewa requires and a matching signature', () => {
    const payload = esewa.buildPaymentPayload({
      transactionUuid: 'FMN-2601-00001-abcd1234',
      amount: 1000,
      deliveryCharge: 100,
    });

    expect(payload.formUrl).toContain('esewa.com.np');
    expect(payload.fields).toMatchObject({
      amount: '1000',
      tax_amount: '0',
      total_amount: '1100',
      transaction_uuid: 'FMN-2601-00001-abcd1234',
      product_code: 'EPAYTEST',
      product_delivery_charge: '100',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    });
    expect(payload.fields.success_url).toBe('http://localhost:5000/api/payments/esewa/success');
    expect(payload.fields.failure_url).toBe('http://localhost:5000/api/payments/esewa/failure');
    expect(payload.fields.signature).toBe(esewa.buildSignature(payload.fields));
  });

  it('rolls delivery charge into total_amount', () => {
    const { fields } = esewa.buildPaymentPayload({ transactionUuid: 'u1', amount: 2499.5, deliveryCharge: 100 });
    expect(fields.total_amount).toBe('2599.5');
  });
});

describe('eSewa callback verification', () => {
  it('decodes a correctly signed callback', () => {
    const decoded = esewa.decodeCallbackData(encode(signedCallback()));
    expect(decoded.status).toBe('COMPLETE');
    expect(decoded.transaction_uuid).toBe('FMN-2601-00001-abcd1234');
  });

  it('rejects a callback whose amount was tampered with after signing', () => {
    const payload = signedCallback();
    payload.total_amount = '1.0';
    expect(() => esewa.decodeCallbackData(encode(payload))).toThrow(/signature verification failed/i);
  });

  it('rejects a callback signed with the wrong secret', () => {
    const payload = signedCallback();
    payload.signature = esewa.buildSignature(payload, payload.signed_field_names.split(','), 'not-the-secret');
    expect(() => esewa.decodeCallbackData(encode(payload))).toThrow(/signature verification failed/i);
  });

  it('rejects unsigned and malformed payloads', () => {
    expect(() => esewa.decodeCallbackData(encode({ status: 'COMPLETE' }))).toThrow(/not signed/i);
    expect(() => esewa.decodeCallbackData('%%%not-base64%%%')).toThrow(/Malformed/i);
    expect(() => esewa.decodeCallbackData('')).toThrow(/Missing/i);
  });

  it('parses amounts that eSewa returns with thousands separators', () => {
    expect(esewa.parseAmount('1,100.0')).toBe(1100);
    expect(esewa.parseAmount('980')).toBe(980);
  });
});
