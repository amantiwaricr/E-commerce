'use strict';

const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

// Single source of truth, so a placeholder can never look like a real transport.
const isConfigured = () => env.mailConfigured;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.password },
    // Fail fast: a blocked or unreachable mail host must not hang a request.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporter;
};

/**
 * Sends a transactional email. Never throws: notification failures must not
 * roll back an order that has already been paid for.
 */
const sendMail = async ({ to, subject, html, text, attachments }) => {
  if (!to) return { sent: false, skipped: true, reason: 'no recipient' };

  const tx = getTransporter();
  if (!tx) {
    logger.warn(`SMTP not configured — skipping email "${subject}" to ${to}`);
    return { sent: false, skipped: true, reason: 'SMTP is not configured in server/.env' };
  }

  try {
    const info = await tx.sendMail({
      from: `"${env.mail.fromName}" <${env.mail.fromAddress}>`,
      to,
      subject,
      html,
      text,
      ...(attachments?.length ? { attachments } : {}),
    });
    logger.info(
      `Email sent to ${to} (${info.messageId})${attachments?.length ? ` with ${attachments.length} attachment(s)` : ''}`
    );
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
};

/** Test seam: lets the suite inject a stub transport. */
const __setTransporter = (tx) => {
  transporter = tx;
};

module.exports = { sendMail, isConfigured, __setTransporter };
