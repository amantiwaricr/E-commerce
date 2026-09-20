'use strict';

const PDFDocument = require('pdfkit');
const { env } = require('../config/env');
const { round2, formatNpr } = require('../utils/money');

/**
 * The customer's bill for a delivered order.
 *
 * `buildInvoice` shapes the order into the exact numbers and lines that will be
 * printed, with no PDF involved, so the arithmetic can be tested on its own.
 * `renderInvoicePdf` only draws what it is handed.
 */

const PAYMENT_LABELS = {
  esewa: 'eSewa wallet',
  card: 'Debit / credit card',
  cod: 'Cash on delivery',
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

/** The moment the order reached a status, taken from its own timeline. */
const timelineAt = (order, status) =>
  (order.trackingInfo?.timeline || []).filter((entry) => entry.status === status).slice(-1)[0]?.at;

/**
 * An invoice number distinct from the order number: the same order must not
 * produce two differently-numbered bills, so it is derived, not sequenced.
 */
const invoiceNumberFor = (order) => `INV-${String(order.orderNumber || '').replace(/^FMN-/, '')}`;

const buildInvoice = (order, user) => {
  const lines = (order.items || []).map((item) => ({
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: round2(item.price),
    // Recomputed rather than trusted, so a stored subtotal that drifted from
    // price × quantity cannot print a bill that does not add up.
    amount: round2(Number(item.price) * Number(item.quantity)),
  }));

  const itemsTotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const deliveryCharge = round2(order.deliveryCharge || 0);
  const grandTotal = round2(itemsTotal + deliveryCharge);

  /*
   * The tip of the order's signed ledger, printed on the bill so the paper
   * carries its own proof. Anyone holding the store's public key can check
   * that this receipt matches the transaction the server signed, without
   * asking the store to confirm it.
   */
  const ledger = order.ledger || [];
  const receipt = ledger.length ? ledger[ledger.length - 1] : null;

  return {
    invoiceNumber: invoiceNumberFor(order),
    orderNumber: order.orderNumber,
    receipt: receipt
      ? { digest: receipt.hash, keyId: receipt.keyId, signed: Boolean(receipt.signature) }
      : null,
    placedAt: order.placedAt || order.createdAt,
    deliveredAt: timelineAt(order, 'delivered'),
    issuedAt: new Date(),

    store: {
      name: env.store.name,
      address: env.store.address,
      phone: env.store.supportPhone,
      email: env.store.supportEmail,
      registration: env.store.registrationNumber
        ? `${env.store.registrationLabel}: ${env.store.registrationNumber}`
        : '',
    },

    customer: {
      name: user?.name || order.shippingAddress?.recipientName || '',
      email: user?.email || '',
      phone: order.shippingAddress?.phone || user?.phone || '',
    },

    deliveredTo: order.shippingAddress || {},
    deliveryMethod: order.deliveryMethod === 'pickup' ? 'Collected in store' : 'Delivered',

    payment: {
      method: PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod,
      status: order.paymentStatus,
      reference: order.payment?.referenceId || '',
      paidAt: order.payment?.paidAt,
    },

    lines,
    itemsTotal,
    deliveryCharge,
    grandTotal,
    /* The store is not VAT registered by default, so the bill says the total is
       what was charged rather than inventing a tax breakdown. */
    taxNote: env.store.registrationNumber
      ? 'Amounts are inclusive of applicable taxes.'
      : 'Amounts shown are the amounts charged. This shop is not VAT registered.',
  };
};

/* ── Drawing ─────────────────────────────────────────────────────────────── */

const INK = '#171211';
const MUTED = '#6b5b5c';
const ACCENT = '#ad0007';
const RULE = '#e4d9d8';

const COLUMNS = [
  { key: 'name', label: 'Item', x: 50, width: 215, align: 'left' },
  { key: 'quantity', label: 'Qty', x: 275, width: 55, align: 'right' },
  { key: 'unitPrice', label: 'Rate', x: 340, width: 85, align: 'right' },
  { key: 'amount', label: 'Amount', x: 435, width: 110, align: 'right' },
];

const rule = (doc, y) => {
  doc.save().strokeColor(RULE).lineWidth(1).moveTo(50, y).lineTo(545, y).stroke().restore();
};

/** Draws the table header; returns the y to start rows at. */
const drawTableHead = (doc, y) => {
  doc.fontSize(8.5).fillColor(MUTED).font('Helvetica-Bold');
  COLUMNS.forEach((col) => {
    doc.text(col.label.toUpperCase(), col.x, y, { width: col.width, align: col.align });
  });
  rule(doc, y + 14);
  return y + 22;
};

/**
 * Renders the invoice and resolves with the finished PDF as a Buffer.
 * Buffered rather than streamed: an invoice is a couple of pages, and a
 * complete buffer means a failure mid-render cannot leave a half-written file
 * on the customer's disk with a 200 status.
 */
const renderInvoicePdf = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
      Title: `Invoice ${invoice.invoiceNumber}`,
      Author: invoice.store.name,
      Subject: `Bill for order ${invoice.orderNumber}`,
    } });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ──
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(20).text(invoice.store.name, 50, 50);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    [invoice.store.address, invoice.store.phone, invoice.store.email, invoice.store.registration]
      .filter(Boolean)
      .forEach((line) => doc.text(line, 50, doc.y, { width: 300 }));

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text('INVOICE', 350, 52, { width: 195, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(invoice.invoiceNumber, 350, 74, { width: 195, align: 'right' });
    doc.text(`Order ${invoice.orderNumber}`, 350, doc.y, { width: 195, align: 'right' });
    doc.text(`Issued ${formatDate(invoice.issuedAt)}`, 350, doc.y, { width: 195, align: 'right' });

    let y = Math.max(doc.y, 135) + 14;
    rule(doc, y);
    y += 16;

    // ── Parties ──
    const billedTo = [
      invoice.customer.name,
      invoice.customer.email,
      invoice.customer.phone,
    ].filter(Boolean);
    const address = [
      invoice.deliveredTo.street,
      [invoice.deliveredTo.city, invoice.deliveredTo.district].filter(Boolean).join(', '),
      invoice.deliveredTo.landmark,
    ].filter(Boolean);

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('BILLED TO', 50, y);
    doc.text(invoice.deliveryMethod.toUpperCase() === 'DELIVERED' ? 'DELIVERED TO' : 'COLLECTED BY', 300, y);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    billedTo.forEach((line, i) => doc.text(line, 50, y + 14 + i * 13, { width: 230 }));
    address.forEach((line, i) => doc.text(line, 300, y + 14 + i * 13, { width: 245 }));

    y += 16 + Math.max(billedTo.length, address.length) * 13 + 12;

    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Placed  ${formatDate(invoice.placedAt)}`, 50, y);
    doc.text(`Delivered  ${formatDate(invoice.deliveredAt)}`, 300, y, { width: 245 });
    y += 24;

    // ── Items ──
    y = drawTableHead(doc, y);

    invoice.lines.forEach((line) => {
      // A long product name wraps, so the row height is measured before drawing.
      const nameHeight = doc.font('Helvetica').fontSize(9.5).heightOfString(line.name, { width: COLUMNS[0].width });
      const rowHeight = Math.max(nameHeight, 13) + 9;

      if (y + rowHeight > 720) {
        doc.addPage();
        y = drawTableHead(doc, 60);
      }

      doc.fillColor(INK).font('Helvetica').fontSize(9.5);
      doc.text(line.name, COLUMNS[0].x, y, { width: COLUMNS[0].width });
      doc.text(`${line.quantity} ${line.unit}`, COLUMNS[1].x, y, { width: COLUMNS[1].width, align: 'right' });
      doc.text(formatNpr(line.unitPrice), COLUMNS[2].x, y, { width: COLUMNS[2].width, align: 'right' });
      doc.font('Helvetica-Bold').text(formatNpr(line.amount), COLUMNS[3].x, y, { width: COLUMNS[3].width, align: 'right' });

      y += rowHeight;
      rule(doc, y - 4);
    });

    // ── Totals ──
    y += 10;
    const total = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 9.5);
      doc.fillColor(bold ? INK : MUTED).text(label, 300, y, { width: 135, align: 'right' });
      doc.fillColor(bold ? ACCENT : INK).text(formatNpr(value), 435, y, { width: 110, align: 'right' });
      y += bold ? 22 : 16;
    };

    total('Items total', invoice.itemsTotal);
    total(invoice.deliveryCharge === 0 ? 'Delivery (free)' : 'Delivery', invoice.deliveryCharge);
    rule(doc, y + 2);
    y += 10;
    total('Total paid', invoice.grandTotal, true);

    // ── Payment + footer ──
    y += 6;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Paid by ${invoice.payment.method} — ${invoice.payment.status}`, 50, y, { width: 245 });
    if (invoice.payment.reference) doc.text(`Reference ${invoice.payment.reference}`, 50, doc.y, { width: 245 });
    if (invoice.payment.paidAt) doc.text(`Paid on ${formatDate(invoice.payment.paidAt)}`, 50, doc.y, { width: 245 });

    if (invoice.receipt?.digest) {
      // Broken across two lines: 64 hex characters do not fit the page width,
      // and a digest that wraps mid-character cannot be read back by hand.
      const digest = invoice.receipt.digest;
      doc.fontSize(7).fillColor(MUTED);
      doc.text(
        `Verification digest (SHA-256${invoice.receipt.signed ? ', Ed25519 signed' : ''}${
          invoice.receipt.keyId ? `, key ${invoice.receipt.keyId}` : ''
        })`,
        50, 726, { width: 495, align: 'center' }
      );
      doc.font('Courier').fontSize(7).fillColor(MUTED);
      doc.text(`${digest.slice(0, 32)}`, 50, 737, { width: 495, align: 'center' });
      doc.text(`${digest.slice(32)}`, 50, 746, { width: 495, align: 'center' });
      doc.font('Helvetica');
    }

    doc.fontSize(8).fillColor(MUTED);
    doc.text(invoice.taxNote, 50, 760, { width: 495, align: 'center' });
    doc.text(
      `Thank you for shopping with ${invoice.store.name}. Questions about this bill? Call ${invoice.store.phone}.`,
      50, 774, { width: 495, align: 'center' }
    );

    doc.end();
  });

module.exports = { buildInvoice, renderInvoicePdf, invoiceNumberFor, timelineAt, PAYMENT_LABELS };
