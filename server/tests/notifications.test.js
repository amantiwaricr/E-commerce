'use strict';

jest.mock('../src/services/email.service', () => ({ sendMail: jest.fn(async () => ({ sent: true })) }));
jest.mock('../src/services/whatsapp.service', () => ({ sendWhatsApp: jest.fn(async () => ({ sent: true })) }));

const { sendMail } = require('../src/services/email.service');
const { sendWhatsApp } = require('../src/services/whatsapp.service');
const { sendOrderStatusUpdate, shouldEmailStatus } = require('../src/services/notification.service');

const order = (orderStatus) => ({
  _id: 'o1',
  orderNumber: 'FMN-2026-00184',
  orderStatus,
  paymentStatus: 'paid',
  paymentMethod: 'esewa',
  items: [{ name: 'Goat Curry Cut', quantity: 1, price: 1450, subtotal: 1450, unit: 'kg', slug: 'g' }],
  itemsTotal: 1450,
  deliveryCharge: 0,
  totalAmount: 1450,
  shippingAddress: { recipientName: 'Sita Rai', phone: '9841000000', street: 'Jhamsikhel', city: 'Lalitpur' },
  trackingInfo: { timeline: [] },
});
const user = { name: 'Sita Rai', email: 'sita@example.com', phone: '9841000000' };

beforeEach(() => {
  sendMail.mockClear();
  sendWhatsApp.mockClear();
});

describe('which status changes earn an email', () => {
  it('emails the two ends of the journey', () => {
    expect(shouldEmailStatus('confirmed')).toBe(true);
    expect(shouldEmailStatus('delivered')).toBe(true);
  });

  it('stays quiet for the steps in between', () => {
    expect(shouldEmailStatus('processing')).toBe(false);
    expect(shouldEmailStatus('shipped')).toBe(false);
    expect(shouldEmailStatus('pending')).toBe(false);
  });

  it('still emails a cancellation — silence there is worse than an extra mail', () => {
    expect(shouldEmailStatus('cancelled')).toBe(true);
  });

  it('does not care about casing, and refuses nonsense', () => {
    expect(shouldEmailStatus('DELIVERED')).toBe(true);
    expect(shouldEmailStatus('')).toBe(false);
    expect(shouldEmailStatus(undefined)).toBe(false);
    expect(shouldEmailStatus('elivered')).toBe(false);
  });
});

describe('sendOrderStatusUpdate', () => {
  it('sends the mail when the order is delivered', async () => {
    const result = await sendOrderStatusUpdate(order('delivered'), user);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('sita@example.com');
    expect(result.email.sent).toBe(true);
  });

  it('sends no mail for processing or shipped', async () => {
    for (const status of ['processing', 'shipped']) {
      sendMail.mockClear();
      const result = await sendOrderStatusUpdate(order(status), user);
      expect(sendMail).not.toHaveBeenCalled();
      expect(result.email).toMatchObject({ sent: false, skipped: true });
      expect(result.email.reason).toContain(status);
    }
  });

  it('still messages WhatsApp on every step — only the email is filtered', async () => {
    for (const status of ['processing', 'shipped', 'delivered']) {
      sendWhatsApp.mockClear();
      await sendOrderStatusUpdate(order(status), user);
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    }
  });

  it('reports a skipped email as not sent rather than throwing', async () => {
    await expect(sendOrderStatusUpdate(order('shipped'), user)).resolves.toBeDefined();
  });
});
