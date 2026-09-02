'use strict';

const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

const isConfigured = () => Boolean(env.mail.host && env.mail.user && env.mail.password);

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.password },
  });
  return transporter;
};

/**
 * Sends a transactional email. Never throws: notification failures must not
 * roll back an order that has already been paid for.
 */
const sendMail = async ({ to, subject, html, text }) => {
  if (!to) return { sent: false, skipped: true, reason: 'no recipient' };

  const tx = getTransporter();
  if (!tx) {
    logger.warn(`SMTP not configured — skipping email "${subject}" to ${to}`);
    return { sent: false, skipped: true, reason: 'smtp not configured' };
  }

  try {
    const info = await tx.sendMail({
      from: `"${env.mail.fromName}" <${env.mail.fromAddress}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent to ${to} (${info.messageId})`);
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
