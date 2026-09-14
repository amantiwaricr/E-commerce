'use strict';

const { priceItems, deliveryChargeFor } = require('../src/services/pricing.service');
const { toWhatsAppNumber, isValidNepaliPhone } = require('../src/utils/phone');
const { sanitizeValue } = require('../src/utils/sanitize');
const { round2, formatNpr } = require('../src/utils/money');
const templates = require('../src/services/templates');
const { ORDER_STATUS_TRANSITIONS } = require('../src/models/Order');

const product = (over = {}) => ({
  _id: 'p1',
  name: 'Khasi Curry Cut',
  slug: 'khasi-curry-cut',
  unit: 'kg',
  price: 1450,
  images: ['https://cdn.example/khasi.jpg'],
  ...over,
});

describe('cart pricing', () => {
  it('prices lines from the product record, not the client', () => {
    const { items, itemsTotal, totalAmount, deliveryCharge } = priceItems([
      { product: product(), quantity: 2 },
      { product: product({ _id: 'p2', name: 'Buff Boneless', price: 540 }), quantity: 1 },
    ]);

    expect(items[0].subtotal).toBe(2900);
    expect(itemsTotal).toBe(3440);
    expect(deliveryCharge).toBe(0); // above the free-delivery threshold
    expect(totalAmount).toBe(3440);
  });

  it('adds the delivery charge below the free-delivery threshold', () => {
    const { itemsTotal, deliveryCharge, totalAmount } = priceItems([{ product: product({ price: 620 }), quantity: 1 }]);
    expect(itemsTotal).toBe(620);
    expect(deliveryCharge).toBe(100);
    expect(totalAmount).toBe(720);
  });

  it('charges nothing for delivery on an empty basket', () => {
    expect(deliveryChargeFor(0)).toBe(0);
  });

  it('never charges delivery when the customer collects in store', () => {
    expect(deliveryChargeFor(620, 'pickup')).toBe(0);
    expect(deliveryChargeFor(620, 'standard')).toBe(100);
  });

  it('prices a pick-up basket without a delivery charge', () => {
    const { deliveryCharge, totalAmount } = priceItems([{ product: product({ price: 620 }), quantity: 1 }], 'pickup');
    expect(deliveryCharge).toBe(0);
    expect(totalAmount).toBe(620);
  });

  it('rounds money to two decimals', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(formatNpr(1250)).toBe('Rs. 1,250.00');
  });
});

describe('Nepali phone handling', () => {
  it.each([
    ['9801234567', '9779801234567'],
    ['098-01234567', '9779801234567'],
    ['+977 9812345678', '9779812345678'],
    ['977-9841000000', '9779841000000'],
  ])('normalises %s for WhatsApp', (input, expected) => {
    expect(toWhatsAppNumber(input)).toBe(expected);
  });

  it('returns null for input that cannot be a phone number', () => {
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('12345')).toBeNull();
    expect(toWhatsAppNumber(null)).toBeNull();
  });

  it('validates Nepali mobile prefixes', () => {
    expect(isValidNepaliPhone('9801234567')).toBe(true);
    expect(isValidNepaliPhone('+9779841000000')).toBe(true);
    expect(isValidNepaliPhone('1234567890')).toBe(false);
    expect(isValidNepaliPhone('980123456')).toBe(false);
  });
});

describe('input sanitisation', () => {
  it('strips MongoDB operators and dotted keys from user input', () => {
    const clean = sanitizeValue({
      email: 'a@b.com',
      password: { $ne: null },
      'nested.key': 'x',
      list: [{ $where: 'evil' }, { ok: 1 }],
    });

    expect(clean).toEqual({ email: 'a@b.com', password: {}, list: [{}, { ok: 1 }] });
  });
});

describe('notification templates', () => {
  const order = {
    orderNumber: 'FMN-2601-00001',
    customerName: 'Sita',
    items: [{ name: 'Khasi Curry Cut', quantity: 2, unit: 'kg', subtotal: 2900 }],
    itemsTotal: 2900,
    deliveryCharge: 100,
    totalAmount: 3000,
    paymentMethod: 'esewa',
    paymentStatus: 'paid',
    orderStatus: 'confirmed',
    shippingAddress: { street: 'Jhamsikhel', city: 'Lalitpur', phone: '9801234567' },
    trackingInfo: { estimatedDelivery: 'Tomorrow' },
  };

  it('builds an email carrying the order number, total, payment method and tracking URL', () => {
    const mail = templates.orderConfirmationEmail(order);
    expect(mail.subject).toContain('FMN-2601-00001');
    expect(mail.html).toContain('Khasi Curry Cut');
    expect(mail.html).toContain('Rs. 3,000.00');
    expect(mail.html).toContain('eSewa');
    expect(mail.html).toContain('http://localhost:5173/orders/FMN-2601-00001');
    expect(mail.text).toContain('Track your order: http://localhost:5173/orders/FMN-2601-00001');
  });

  it('escapes HTML in customer-supplied fields', () => {
    const mail = templates.orderConfirmationEmail({
      ...order,
      customerName: '<script>alert(1)</script>',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('builds a WhatsApp body with the same essentials', () => {
    const body = templates.orderConfirmationWhatsApp(order);
    expect(body).toContain('FMN-2601-00001');
    expect(body).toContain('Rs. 3,000.00');
    expect(body).toContain('http://localhost:5173/orders/FMN-2601-00001');
  });
});

describe('Google sign-in failure messages', () => {
  const { __describeVerificationFailure: describe_ } = require('../src/controllers/auth.controller');

  it('names a client ID mismatch, the most common misconfiguration', () => {
    const message = describe_('Wrong recipient, payload audience != requiredAudience');
    expect(message).toMatch(/does not match GOOGLE_CLIENT_ID/i);
    expect(message).toMatch(/npm run doctor/);
  });

  it('explains an expired token', () => {
    expect(describe_('Token used too late, 1700000000 > 1699999999')).toMatch(/expired/i);
  });

  it('explains a clock skew', () => {
    expect(describe_('Token used too early')).toMatch(/clock/i);
  });

  it('explains a malformed or forged token', () => {
    expect(describe_('Wrong number of segments in token')).toMatch(/could not be verified/i);
    expect(describe_('Invalid token signature')).toMatch(/could not be verified/i);
  });

  it('falls back to a generic message for anything unrecognised', () => {
    expect(describe_('some brand new google error')).toBe('Google sign-in failed. Please try again.');
  });
});

describe('order status machine', () => {
  it('only allows forward moves or cancellation', () => {
    expect(ORDER_STATUS_TRANSITIONS.pending).toEqual(['confirmed', 'cancelled']);
    expect(ORDER_STATUS_TRANSITIONS.shipped).toEqual(['delivered', 'cancelled']);
  });

  it('treats delivered and cancelled as terminal', () => {
    expect(ORDER_STATUS_TRANSITIONS.delivered).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
  });
});
