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

describe('Placeholder detection', () => {
  const { isPlaceholder, configured } = require('../src/config/env');

  it.each([
    'your-gmail-address@gmail.com',
    'your-16-char-app-password',
    'change-me-to-a-long-random-secret',
    '<paste-here>',
    '',
    '   ',
    undefined,
  ])('treats %s as not filled in', (value) => {
    expect(isPlaceholder(value)).toBe(true);
  });

  it.each(['smtp.gmail.com', 'orders@freshmeatnepal.com', 'abcd efgh ijkl mnop'])(
    'treats %s as a real value',
    (value) => {
      expect(isPlaceholder(value)).toBe(false);
    }
  );

  it('requires every value to be real before calling a service configured', () => {
    expect(configured('smtp.gmail.com', 'me@gmail.com', 'a-real-password')).toBe(true);
    expect(configured('smtp.gmail.com', 'your-gmail-address@gmail.com', 'a-real-password')).toBe(false);
  });
});

describe('Remembering a delivery address', () => {
  const User = require('../src/models/User');
  const make = () => new User({ name: 'A', email: 'a@b.com', passwordHash: 'x' });
  const address = (street, over = {}) => ({
    recipientName: 'Sita Sharma',
    phone: '9801234567',
    street,
    city: 'Lalitpur',
    ...over,
  });

  it('keeps the most recently used address first', () => {
    const user = make();
    user.rememberAddress(address('Jhamsikhel Road 12'));
    user.rememberAddress(address('Pulchowk 4'));

    expect(user.addresses.map((a) => a.street)).toEqual(['Pulchowk 4', 'Jhamsikhel Road 12']);
  });

  it('moves a re-used address back to the front instead of duplicating it', () => {
    const user = make();
    user.rememberAddress(address('Jhamsikhel Road 12'));
    user.rememberAddress(address('Pulchowk 4'));
    // Same place, typed with different spacing and case.
    user.rememberAddress(address('  jhamsikhel road 12  '));

    expect(user.addresses).toHaveLength(2);
    expect(user.addresses[0].street.trim().toLowerCase()).toBe('jhamsikhel road 12');
  });

  it('treats a different phone or city as a different address', () => {
    const user = make();
    user.rememberAddress(address('Pulchowk 4'));
    user.rememberAddress(address('Pulchowk 4', { phone: '9841000000' }));
    user.rememberAddress(address('Pulchowk 4', { city: 'Kathmandu' }));

    expect(user.addresses).toHaveLength(3);
  });

  it('caps the list so it cannot grow without bound', () => {
    const user = make();
    for (let i = 0; i < 12; i += 1) user.rememberAddress(address(`Street ${i}`));

    expect(user.addresses).toHaveLength(5);
    expect(user.addresses[0].street).toBe('Street 11');
  });

  it('ignores an address with no street or city', () => {
    const user = make();
    expect(user.rememberAddress({ street: '', city: 'Lalitpur' })).toBe(false);
    expect(user.rememberAddress({ street: 'Somewhere', city: '' })).toBe(false);
    expect(user.rememberAddress(undefined)).toBe(false);
    expect(user.addresses).toHaveLength(0);
  });
});
