'use strict';

const { buildInvoice, renderInvoicePdf, invoiceNumberFor, timelineAt } = require('../src/services/invoice.service');

const baseOrder = (over = {}) => ({
  orderNumber: 'FMN-2026-00184',
  orderStatus: 'delivered',
  paymentStatus: 'paid',
  paymentMethod: 'esewa',
  deliveryMethod: 'standard',
  placedAt: new Date('2026-09-12T09:41:00Z'),
  payment: { referenceId: '000AE01', paidAt: new Date('2026-09-12T09:43:00Z') },
  items: [
    { name: 'Goat Curry Cut', unit: 'kg', price: 1450, quantity: 2, subtotal: 2900 },
    { name: 'Chicken Breast', unit: 'kg', price: 620, quantity: 1.5, subtotal: 930 },
  ],
  deliveryCharge: 100,
  shippingAddress: { recipientName: 'Sita Rai', phone: '9841000000', street: 'Jhamsikhel 12', city: 'Lalitpur' },
  trackingInfo: {
    timeline: [
      { status: 'pending', at: new Date('2026-09-12T09:41:00Z') },
      { status: 'delivered', at: new Date('2026-09-13T11:20:00Z') },
    ],
  },
  ...over,
});
const user = { name: 'Sita Rai', email: 'sita@example.com', phone: '9841000000' };

describe('invoice numbering', () => {
  it('derives a stable number from the order, so one order is one bill', () => {
    expect(invoiceNumberFor({ orderNumber: 'FMN-2026-00184' })).toBe('INV-2026-00184');
    expect(invoiceNumberFor({ orderNumber: 'FMN-2026-00184' })).toBe(invoiceNumberFor({ orderNumber: 'FMN-2026-00184' }));
  });
});

describe('timelineAt', () => {
  it('finds when the order reached a status', () => {
    expect(timelineAt(baseOrder(), 'delivered')).toEqual(new Date('2026-09-13T11:20:00Z'));
  });

  it('takes the latest entry when a status repeats', () => {
    const order = baseOrder({ trackingInfo: { timeline: [
      { status: 'delivered', at: new Date('2026-09-13T09:00:00Z') },
      { status: 'delivered', at: new Date('2026-09-13T11:20:00Z') },
    ] } });
    expect(timelineAt(order, 'delivered')).toEqual(new Date('2026-09-13T11:20:00Z'));
  });

  it('returns nothing when the status never happened', () => {
    expect(timelineAt(baseOrder(), 'shipped')).toBeUndefined();
    expect(timelineAt({}, 'delivered')).toBeUndefined();
  });
});

describe('the numbers on the bill', () => {
  it('bills each line at price × quantity', () => {
    const { lines } = buildInvoice(baseOrder(), user);
    expect(lines[0].amount).toBe(2900);
    expect(lines[1].amount).toBe(930); // 620 × 1.5 — a fractional weight
  });

  it('recomputes the line rather than trusting a stored subtotal', () => {
    // A subtotal that drifted from price × quantity must not reach the bill.
    const order = baseOrder({ items: [{ name: 'Goat', unit: 'kg', price: 1000, quantity: 2, subtotal: 99 }] });
    expect(buildInvoice(order, user).lines[0].amount).toBe(2000);
  });

  it('adds delivery to the items total', () => {
    const invoice = buildInvoice(baseOrder(), user);
    expect(invoice.itemsTotal).toBe(3830);
    expect(invoice.deliveryCharge).toBe(100);
    expect(invoice.grandTotal).toBe(3930);
  });

  it('adds up: the total is the sum of the lines plus delivery', () => {
    const invoice = buildInvoice(baseOrder(), user);
    const summed = invoice.lines.reduce((total, line) => total + line.amount, 0) + invoice.deliveryCharge;
    expect(invoice.grandTotal).toBe(summed);
  });

  it('handles free delivery and an empty order without producing NaN', () => {
    expect(buildInvoice(baseOrder({ deliveryCharge: 0 }), user).grandTotal).toBe(3830);
    const empty = buildInvoice(baseOrder({ items: [], deliveryCharge: 0 }), user);
    expect(empty.grandTotal).toBe(0);
    expect(Number.isNaN(empty.grandTotal)).toBe(false);
  });

  it('rounds money to two places', () => {
    const order = baseOrder({ items: [{ name: 'X', unit: 'kg', price: 33.333, quantity: 3, subtotal: 0 }], deliveryCharge: 0 });
    expect(buildInvoice(order, user).grandTotal).toBe(100);
  });
});

describe('who the bill is for', () => {
  it('names the account holder', () => {
    expect(buildInvoice(baseOrder(), user).customer).toMatchObject({ name: 'Sita Rai', email: 'sita@example.com' });
  });

  it('falls back to the recipient when the account has no name', () => {
    expect(buildInvoice(baseOrder(), {}).customer.name).toBe('Sita Rai');
    expect(buildInvoice(baseOrder(), null).customer.name).toBe('Sita Rai');
  });

  it('says collected, not delivered, for a pick-up order', () => {
    expect(buildInvoice(baseOrder({ deliveryMethod: 'pickup' }), user).deliveryMethod).toBe('Collected in store');
  });

  it('spells out the payment method', () => {
    expect(buildInvoice(baseOrder({ paymentMethod: 'cod' }), user).payment.method).toBe('Cash on delivery');
    expect(buildInvoice(baseOrder({ paymentMethod: 'card' }), user).payment.method).toBe('Debit / credit card');
  });
});

describe('rendering', () => {
  it('produces a real PDF', async () => {
    const pdf = await renderInvoicePdf(buildInvoice(baseOrder(), user));
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('survives a long product name and a long basket', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Product ${i} with a name long enough to wrap across more than one line on the page`,
      unit: 'kg', price: 100 + i, quantity: 2, subtotal: 0,
    }));
    const pdf = await renderInvoicePdf(buildInvoice(baseOrder({ items }), user));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders when the order has no timeline and no payment reference', async () => {
    const order = baseOrder({ trackingInfo: { timeline: [] }, payment: {} });
    const invoice = buildInvoice(order, user);
    expect(invoice.deliveredAt).toBeUndefined();
    await expect(renderInvoicePdf(invoice)).resolves.toBeInstanceOf(Buffer);
  });
});

describe('the verification digest on the bill', () => {
  const integrity = require('../src/services/integrity.service');

  const withLedger = () => {
    const order = {
      orderNumber: 'FMN-2026-00184',
      user: '65f0000000000000000000aa',
      items: [{ product: 'p1', name: 'Goat curry cut', unit: 'kg', price: 1450, quantity: 2, subtotal: 2900 }],
      itemsTotal: 2900, deliveryCharge: 100, totalAmount: 3000,
      paymentMethod: 'esewa', paymentStatus: 'paid', deliveryMethod: 'standard',
      shippingAddress: { recipientName: 'A', phone: '98', street: 'S', city: 'C' },
      payment: {},
      ledger: [],
    };
    integrity.appendEntry(order, { type: 'order.placed', data: integrity.placementFacts(order) });
    return order;
  };

  it('carries the tip of the ledger, so the paper proves itself', () => {
    const order = withLedger();
    const invoice = buildInvoice(order, { name: 'A', email: 'a@b.c' });

    expect(invoice.receipt.digest).toBe(order.ledger[order.ledger.length - 1].hash);
    expect(invoice.receipt.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('moves with the ledger rather than being pinned to the first entry', () => {
    const order = withLedger();
    const first = buildInvoice(order, {}).receipt.digest;

    integrity.appendEntry(order, { type: 'payment.settled', data: { amount: 3000 } });
    expect(buildInvoice(order, {}).receipt.digest).not.toBe(first);
  });

  it('is absent, not invented, on an order with no ledger', () => {
    const order = withLedger();
    order.ledger = [];
    expect(buildInvoice(order, {}).receipt).toBeNull();
  });
});
