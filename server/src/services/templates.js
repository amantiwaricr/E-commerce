'use strict';

const { env } = require('../config/env');
const { formatNpr } = require('../utils/money');

const PAYMENT_METHOD_LABELS = {
  esewa: 'eSewa',
  cod: 'Cash on Delivery',
  card: 'Card (via eSewa)',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const trackingUrl = (order) => `${env.frontendUrl}/orders/${order.orderNumber}`;

const paymentLabel = (order) =>
  `${PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod} — ${
    order.paymentStatus === 'paid' ? 'Paid' : 'Payable on delivery'
  }`;

/** HTML order-confirmation email. */
const orderConfirmationEmail = (order) => {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity} ${escapeHtml(
        item.unit
      )}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${formatNpr(item.subtotal)}</td>
        </tr>`
    )
    .join('');

  const html = `
  <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f6f6f6;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:#b3202c;color:#fff;padding:24px;">
        <h1 style="margin:0;font-size:22px;">${escapeHtml(env.store.name)}</h1>
        <p style="margin:6px 0 0;opacity:.9;">Your order is confirmed</p>
      </div>
      <div style="padding:24px;color:#222;">
        <p>Namaste ${escapeHtml(order.customerName || 'there')},</p>
        <p>Thank you for your order. Here is your summary:</p>
        <p style="font-size:15px;"><strong>Order number:</strong> ${escapeHtml(order.orderNumber)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="text-align:left;padding:10px 8px;">Item</th>
              <th style="text-align:center;padding:10px 8px;">Qty</th>
              <th style="text-align:right;padding:10px 8px;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <table style="width:100%;font-size:14px;margin-top:14px;">
          <tr><td>Items total</td><td style="text-align:right;">${formatNpr(order.itemsTotal)}</td></tr>
          <tr><td>Delivery</td><td style="text-align:right;">${formatNpr(order.deliveryCharge)}</td></tr>
          <tr style="font-weight:700;font-size:16px;">
            <td style="padding-top:8px;">Total</td>
            <td style="text-align:right;padding-top:8px;">${formatNpr(order.totalAmount)}</td>
          </tr>
        </table>
        <p style="margin-top:18px;"><strong>Payment:</strong> ${escapeHtml(paymentLabel(order))}</p>
        <p><strong>Delivering to:</strong> ${escapeHtml(order.shippingAddress.street)}, ${escapeHtml(
    order.shippingAddress.city
  )} — ${escapeHtml(order.shippingAddress.phone)}</p>
        <p><strong>Expected delivery:</strong> ${escapeHtml(
          order.trackingInfo?.estimatedDelivery || env.store.deliveryEta
        )}</p>
        <p style="margin:24px 0;">
          <a href="${trackingUrl(order)}"
             style="background:#b3202c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block;">
            Track your order
          </a>
        </p>
        <p style="color:#666;font-size:13px;">Questions? Call us at ${escapeHtml(env.store.supportPhone)}.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `${env.store.name} — order confirmed`,
    `Order number: ${order.orderNumber}`,
    '',
    ...order.items.map((i) => `- ${i.name} x ${i.quantity} ${i.unit} = ${formatNpr(i.subtotal)}`),
    '',
    `Items total: ${formatNpr(order.itemsTotal)}`,
    `Delivery: ${formatNpr(order.deliveryCharge)}`,
    `Total: ${formatNpr(order.totalAmount)}`,
    `Payment: ${paymentLabel(order)}`,
    `Expected delivery: ${order.trackingInfo?.estimatedDelivery || env.store.deliveryEta}`,
    `Track your order: ${trackingUrl(order)}`,
  ].join('\n');

  return { subject: `${env.store.name} — order ${order.orderNumber} confirmed`, html, text };
};

/** Plain-text WhatsApp body (WhatsApp does not render HTML). */
const orderConfirmationWhatsApp = (order) =>
  [
    `*${env.store.name}* — order confirmed ✅`,
    '',
    `Order: *${order.orderNumber}*`,
    ...order.items.map((i) => `• ${i.name} x ${i.quantity} ${i.unit} — ${formatNpr(i.subtotal)}`),
    '',
    `Total: *${formatNpr(order.totalAmount)}*`,
    `Payment: ${paymentLabel(order)}`,
    `Expected delivery: ${order.trackingInfo?.estimatedDelivery || env.store.deliveryEta}`,
    '',
    `Track: ${trackingUrl(order)}`,
  ].join('\n');

/** Status-change email sent whenever an admin advances an order. */
const orderStatusEmail = (order, note = '') => {
  const html = `
  <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f6f6f6;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;color:#222;">
      <h2 style="margin-top:0;color:#b3202c;">Order ${escapeHtml(order.orderNumber)} is now ${escapeHtml(
    order.orderStatus
  )}</h2>
      ${note ? `<p>${escapeHtml(note)}</p>` : ''}
      ${
        order.trackingInfo?.trackingCode
          ? `<p><strong>Tracking code:</strong> ${escapeHtml(order.trackingInfo.trackingCode)} (${escapeHtml(
              order.trackingInfo.carrier || 'courier'
            )})</p>`
          : ''
      }
      <p><a href="${trackingUrl(order)}" style="color:#b3202c;">View order details</a></p>
    </div>
  </div>`;

  return {
    subject: `${env.store.name} — order ${order.orderNumber} is ${order.orderStatus}`,
    html,
    text: `Order ${order.orderNumber} is now ${order.orderStatus}.${note ? ` ${note}` : ''}\nTrack: ${trackingUrl(
      order
    )}`,
  };
};

const orderStatusWhatsApp = (order, note = '') =>
  [
    `*${env.store.name}*`,
    `Order *${order.orderNumber}* is now *${order.orderStatus}*.`,
    note ? note : '',
    `Track: ${trackingUrl(order)}`,
  ]
    .filter(Boolean)
    .join('\n');

module.exports = {
  PAYMENT_METHOD_LABELS,
  trackingUrl,
  escapeHtml,
  orderConfirmationEmail,
  orderConfirmationWhatsApp,
  orderStatusEmail,
  orderStatusWhatsApp,
};
