'use strict';

const Order = require('../models/Order');
const { sendMail } = require('./email.service');
const { sendWhatsApp } = require('./whatsapp.service');
const templates = require('./templates');
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

/** Notifies the customer that their order moved to a new status. */
const sendOrderStatusUpdate = async (order, user, note = '') => {
  const payload = toTemplateOrder(order, user);
  const mail = templates.orderStatusEmail(payload, note);

  const [email, whatsapp] = await Promise.all([
    sendMail({ to: user?.email, subject: mail.subject, html: mail.html, text: mail.text }),
    sendWhatsApp({ to: order.shippingAddress?.phone || user?.phone, body: templates.orderStatusWhatsApp(payload, note) }),
  ]);

  return { email, whatsapp };
};

module.exports = { sendOrderConfirmation, sendOrderStatusUpdate, toTemplateOrder };
