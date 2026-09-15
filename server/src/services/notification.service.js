'use strict';

const Order = require('../models/Order');
const { env } = require('../config/env');
const { sendMail } = require('./email.service');
const { sendWhatsApp } = require('./whatsapp.service');
const templates = require('./templates');
const invoiceService = require('./invoice.service');
const logger = require('../utils/logger');

/**
 * Shapes an Order document (plus its customer) into the flat object the
 * templates expect.
 */
const toTemplateOrder = (order, user) => ({
  orderNumber: order.orderNumber,
  customerName: user?.name || order.shippingAddress?.recipientName || '',
  items: order.items,
  itemsTotal: order.itemsTotal,
  deliveryCharge: order.deliveryCharge,
  totalAmount: order.totalAmount,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  orderStatus: order.orderStatus,
  shippingAddress: order.shippingAddress,
  trackingInfo: order.trackingInfo,
});

/**
 * Fires the order-confirmation email + WhatsApp message and records the outcome
 * on the order. Failures are stored, never thrown: the order is already placed.
 */
const sendOrderConfirmation = async (order, user) => {
  const payload = toTemplateOrder(order, user);
  const mail = templates.orderConfirmationEmail(payload);
  const waBody = templates.orderConfirmationWhatsApp(payload);
  const phone = order.shippingAddress?.phone || user?.phone;

  const [emailResult, waResult] = await Promise.all([
    sendMail({ to: user?.email, subject: mail.subject, html: mail.html, text: mail.text }),
    sendWhatsApp({ to: phone, body: waBody }),
  ]);

  try {
    const notifications = {
      ...(typeof order.notifications?.toObject === 'function' ? order.notifications.toObject() : order.notifications),
    };
    if (emailResult.sent) notifications.emailSentAt = new Date();
    if (waResult.sent) notifications.whatsappSentAt = new Date();
    notifications.lastError = [emailResult.error, waResult.error].filter(Boolean).join(' | ');

    // A targeted update, not `order.save()`: this runs after the HTTP response,
    // so the in-memory document may be stale and must not re-send its array
    // deltas over whatever the order looks like by now.
    await Order.updateOne({ _id: order._id }, { $set: { notifications } });
    order.notifications = notifications;
  } catch (err) {
    logger.error('Could not persist notification state', err.message);
  }

  return { email: emailResult, whatsapp: waResult };
};

/**
 * Whether a move to this status earns an email. Not every step is worth one:
 * a customer who gets a mail for "processing" and another for "shipped" on the
 * way to a same-day delivery learns to ignore the sender. Configured by
 * ORDER_STATUS_EMAILS — see config/env.js.
 */
const shouldEmailStatus = (status) =>
  env.notifications.statusEmails.includes(String(status || '').toLowerCase());

/**
 * The bill, ready to attach. Only a delivered order has one, and a failure to
 * render it must not hold up the email — the customer would rather hear that
 * their order arrived, with a link to the bill, than hear nothing at all.
 */
const invoiceAttachment = async (order, user) => {
  if (order.orderStatus !== 'delivered') return null;
  try {
    const invoice = invoiceService.buildInvoice(order, user);
    const content = await invoiceService.renderInvoicePdf(invoice);
    return { filename: `${invoice.invoiceNumber}.pdf`, content, contentType: 'application/pdf' };
  } catch (err) {
    logger.error(`Could not attach the bill for ${order.orderNumber}: ${err.message}`);
    return null;
  }
};

/**
 * Notifies the customer that their order moved to a new status. The delivery
 * email carries the bill as a PDF.
 *
 * WhatsApp is not filtered: it is the channel for the running commentary, and
 * the email is reserved for the moments that matter.
 */
const sendOrderStatusUpdate = async (order, user, note = '') => {
  const payload = toTemplateOrder(order, user);
  const wanted = shouldEmailStatus(order.orderStatus);

  // Only built when an email is actually going out — rendering a PDF nobody
  // will receive is pure waste.
  const bill = wanted ? await invoiceAttachment(order, user) : null;
  const mail = templates.orderStatusEmail(payload, note, { billAttached: Boolean(bill) });

  const [email, whatsapp] = await Promise.all([
    wanted
      ? sendMail({
          to: user?.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: bill ? [bill] : undefined,
        })
      : Promise.resolve({ sent: false, skipped: true, reason: `no email is sent for "${order.orderStatus}"` }),
    sendWhatsApp({ to: order.shippingAddress?.phone || user?.phone, body: templates.orderStatusWhatsApp(payload, note) }),
  ]);

  return { email, whatsapp, billAttached: Boolean(bill) };
};

module.exports = {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  toTemplateOrder,
  shouldEmailStatus,
  invoiceAttachment,
};
