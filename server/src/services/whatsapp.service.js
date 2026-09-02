'use strict';

const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../utils/logger');
const { toWhatsAppNumber } = require('../utils/phone');

const META_API_VERSION = 'v21.0';

const isConfigured = () => {
  if (env.whatsapp.provider === 'meta') {
    return Boolean(env.whatsapp.meta.token && env.whatsapp.meta.phoneNumberId);
  }
  if (env.whatsapp.provider === 'twilio') {
    return Boolean(env.whatsapp.twilio.accountSid && env.whatsapp.twilio.authToken && env.whatsapp.twilio.from);
  }
  return false;
};

const sendViaMeta = async (to, body) => {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${env.whatsapp.meta.phoneNumberId}/messages`;
  const { data } = await axios.post(
    url,
    { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body } },
    { headers: { Authorization: `Bearer ${env.whatsapp.meta.token}` }, timeout: 15000 }
  );
  return data?.messages?.[0]?.id || '';
};

const sendViaTwilio = async (to, body) => {
  const { accountSid, authToken, from } = env.whatsapp.twilio;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: body });
  const { data } = await axios.post(url, params.toString(), {
    auth: { username: accountSid, password: authToken },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return data?.sid || '';
};

/**
 * Sends a WhatsApp message through the configured provider. Like email, this
 * never throws — a failed notification is logged, not fatal.
 */
const sendWhatsApp = async ({ to, body }) => {
  const number = toWhatsAppNumber(to);
  if (!number) return { sent: false, skipped: true, reason: 'no valid phone number' };

  if (!isConfigured()) {
    logger.warn(`WhatsApp provider "${env.whatsapp.provider}" not configured — skipping message to ${number}`);
    return { sent: false, skipped: true, reason: 'whatsapp not configured' };
  }

  try {
    const messageId =
      env.whatsapp.provider === 'meta' ? await sendViaMeta(number, body) : await sendViaTwilio(number, body);
    logger.info(`WhatsApp message sent to ${number} (${messageId})`);
    return { sent: true, messageId };
  } catch (err) {
    const reason = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.error(`Failed to send WhatsApp message to ${number}:`, reason);
    return { sent: false, error: reason };
  }
};

module.exports = { sendWhatsApp, isConfigured };
