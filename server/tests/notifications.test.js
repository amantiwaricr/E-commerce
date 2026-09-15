'use strict';

jest.mock('../src/services/email.service', () => ({ sendMail: jest.fn(async () => ({ sent: true })) }));
jest.mock('../src/services/whatsapp.service', () => ({ sendWhatsApp: jest.fn(async () => ({ sent: true })) }));

const { sendMail } = require('../src/services/email.service');
const { sendWhatsApp } = require('../src/services/whatsapp.service');
const invoiceService = require('../src/services/invoice.service');
const { sendOrderStatusUpdate, shouldEmailStatus, invoiceAttachment } = require('../src/services/notification.service');

const order = (orderStatus) => ({
  _id: 'o1',
  orderNumber: 'FMN-2026-00184',
  orderStatus,
  deliveryMethod: 'standard',
  placedAt: new Date('2026-09-12T09:41:00Z'),
  payment: { referenceId: '000AE01', paidAt: new Date('2026-09-12T09:43:00Z') },
  paymentStatus: 'paid',
  paymentMethod: 'esewa',
  items: [{ name: 'Goat Curry Cut', quantity: 1, price: 1450, subtotal: 1450, unit: 'kg', slug: 'g' }],
  itemsTotal: 1450,
  deliveryCharge: 0,
  totalAmount: 1450,
  shippingAddress: { recipientName: 'Sita Rai', phone: '9841000000', street: 'Jhamsikhel', city: 'Lalitpur' },
  trackingInfo: { timeline: [{ status: orderStatus, at: new Date('2026-09-13T11:20:00Z') }] },
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

describe('the bill on the delivery email', () => {
  it('attaches the PDF when the order is delivered', async () => {
    const result = await sendOrderStatusUpdate(order('delivered'), user);

    expect(result.billAttached).toBe(true);
    const { attachments } = sendMail.mock.calls[0][0];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('INV-2026-00184.pdf');
    expect(attachments[0].contentType).toBe('application/pdf');
    expect(attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('tells the customer to look for it, in both HTML and plain text', async () => {
    await sendOrderStatusUpdate(order('delivered'), user);
    const { html, text } = sendMail.mock.calls[0][0];
    expect(html).toContain('attached');
    expect(text).toContain('attached');
  });

  it('attaches nothing to a status that is not delivered', async () => {
    await sendOrderStatusUpdate(order('confirmed'), user);
    const call = sendMail.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
    expect(call.text).not.toContain('attached');
  });

  it('renders no bill at all when no email is going out', async () => {
    const result = await sendOrderStatusUpdate(order('shipped'), user);
    expect(result.billAttached).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('builds a bill only for a delivered order', async () => {
    expect(await invoiceAttachment(order('delivered'), user)).not.toBeNull();
    expect(await invoiceAttachment(order('shipped'), user)).toBeNull();
  });

  it('still sends the email when the bill cannot be rendered', async () => {
    const boom = jest
      .spyOn(invoiceService, 'renderInvoicePdf')
      .mockRejectedValueOnce(new Error('font subsystem exploded'));

    const result = await sendOrderStatusUpdate(order('delivered'), user);
    boom.mockRestore();

    expect(result.billAttached).toBe(false);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].attachments).toBeUndefined();
    // And it must not claim an attachment that is not there.
    expect(sendMail.mock.calls[0][0].text).not.toContain('attached');
  });
});
