'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { round2 } = require('../utils/money');

/** Fields eSewa signs, in the exact order the signature string requires. */
const SIGNED_FIELD_NAMES = ['total_amount', 'transaction_uuid', 'product_code'];

/**
 * eSewa expects the signed message as `key=value` pairs joined by commas, in the
 * order given by `signed_field_names`, HMAC-SHA256'd with the merchant secret
 * and base64 encoded.
 */
const buildSignature = (payload, fieldNames = SIGNED_FIELD_NAMES, secret = env.esewa.secretKey) => {
  const message = fieldNames.map((field) => `${field}=${payload[field]}`).join(',');
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

/** eSewa sends amounts back as strings that may carry thousands separators. */
const parseAmount = (value) => Number(String(value ?? '').replace(/,/g, ''));

/**
 * Builds everything the browser needs to POST the eSewa payment form:
 * the endpoint URL and the exact set of signed form fields.
 */
const buildPaymentPayload = ({ transactionUuid, amount, deliveryCharge = 0, taxAmount = 0, serviceCharge = 0 }) => {
  const totalAmount = round2(Number(amount) + Number(deliveryCharge) + Number(taxAmount) + Number(serviceCharge));

  const fields = {
    amount: String(round2(amount)),
    tax_amount: String(round2(taxAmount)),
    total_amount: String(totalAmount),
    transaction_uuid: transactionUuid,
    product_code: env.esewa.merchantCode,
    product_service_charge: String(round2(serviceCharge)),
    product_delivery_charge: String(round2(deliveryCharge)),
    success_url: `${env.backendUrl}/api/payments/esewa/success`,
    failure_url: `${env.backendUrl}/api/payments/esewa/failure`,
    signed_field_names: SIGNED_FIELD_NAMES.join(','),
  };
  fields.signature = buildSignature(fields);

  return { formUrl: env.esewa.formUrl, fields, mode: env.esewa.mode };
};

/**
 * Decodes and verifies the base64 `data` blob eSewa appends to the success
 * callback URL. Throws when the signature does not match the merchant secret.
 */
const decodeCallbackData = (encoded) => {
  if (!encoded) throw ApiError.badRequest('Missing eSewa callback data');

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(String(encoded), 'base64').toString('utf8'));
  } catch (err) {
    throw ApiError.badRequest('Malformed eSewa callback data');
  }

  const fieldNames = String(decoded.signed_field_names || '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  if (!fieldNames.length || !decoded.signature) {
    throw ApiError.badRequest('eSewa callback data is not signed');
  }

  const expected = buildSignature(decoded, fieldNames);
  const received = String(decoded.signature);
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  const signatureValid =
    expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!signatureValid) {
    throw ApiError.badRequest('eSewa callback signature verification failed');
  }

  return decoded;
};

/**
 * Server-to-server confirmation. eSewa's status API is the only source of truth
 * for whether money actually moved, so an order is never marked paid without it.
 * Returns `{ status, refId, totalAmount, raw }`.
 */
const checkTransactionStatus = async ({ transactionUuid, totalAmount }) => {
  const url = env.esewa.statusUrl;
  try {
    const { data } = await axios.get(url, {
      params: {
        product_code: env.esewa.merchantCode,
        total_amount: round2(totalAmount),
        transaction_uuid: transactionUuid,
      },
      timeout: 15000,
    });

    return {
      status: String(data?.status || 'UNKNOWN').toUpperCase(),
      refId: data?.ref_id || '',
      totalAmount: parseAmount(data?.total_amount),
      raw: data,
    };
  } catch (err) {
    logger.error('eSewa status check failed', err?.response?.data || err.message);
    throw new ApiError(502, 'Could not verify the payment with eSewa. Please try again shortly.');
  }
};

module.exports = {
  SIGNED_FIELD_NAMES,
  buildSignature,
  buildPaymentPayload,
  decodeCallbackData,
  checkTransactionStatus,
  parseAmount,
};
