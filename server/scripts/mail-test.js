#!/usr/bin/env node
'use strict';

/**
 * Proves whether the SMTP settings in server/.env actually work.
 *
 *   npm run mail:test                 # verify the connection only
 *   npm run mail:test -- you@mail.com # verify, then send a real test message
 *
 * Gmail's rejections are precise but cryptic, so they are translated below.
 */

const nodemailer = require('nodemailer');
const { env, isPlaceholder } = require('../src/config/env');

const explain = (err) => {
  const text = `${err.code || ''} ${err.responseCode || ''} ${err.message || ''}`;

  if (/535|Username and Password not accepted|BadCredentials/i.test(text)) {
    return [
      'Gmail rejected the username or password.',
      '',
      '  · SMTP_PASSWORD must be a 16-character App Password, not your Google login password.',
      '    Create one at https://myaccount.google.com/apppasswords (needs 2-Step Verification on).',
      '  · Paste it without spaces, and make sure SMTP_USER is the account it belongs to.',
      '  · Workspace/college accounts often have App Passwords disabled by the institution —',
      '    use a personal Gmail as the sender instead.',
    ].join('\n');
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) {
    return `Could not resolve ${env.mail.host}. Check SMTP_HOST and your internet connection.`;
  }
  if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET/i.test(text)) {
    return [
      `Could not reach ${env.mail.host}:${env.mail.port}.`,
      '  · A firewall, antivirus or campus network may be blocking outbound SMTP.',
      '  · Try SMTP_PORT=465 with SMTP_SECURE=true.',
    ].join('\n');
  }
  if (/self signed|certificate/i.test(text)) {
    return 'The TLS certificate was rejected — often a corporate proxy intercepting the connection.';
  }
  return err.message;
};

const main = async () => {
  console.log('\nFresh Meat Nepal — SMTP check\n');

  const fields = { SMTP_HOST: env.mail.host, SMTP_USER: env.mail.user, SMTP_PASSWORD: env.mail.password };
  const unfilled = Object.entries(fields).filter(([, v]) => isPlaceholder(v)).map(([k]) => k);

  if (unfilled.length) {
    console.log(`✗ Not configured: ${unfilled.join(', ')} ${unfilled.length === 1 ? 'is' : 'are'} blank or still an example value.`);
    console.log('\n  Verification codes will be printed in the server terminal and shown on the');
    console.log('  verification screen instead — sign-up still works. Fill in SMTP_* to send real email.\n');
    process.exit(1);
  }

  console.log(`  host    ${env.mail.host}:${env.mail.port} (secure: ${env.mail.secure})`);
  console.log(`  user    ${env.mail.user}`);
  console.log(`  from    ${env.mail.fromAddress}`);
  console.log('');

  const transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.password },
    // Fail fast: a blocked or unreachable mail host must not hang a request.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    await transporter.verify();
    console.log('✓ Connected and authenticated.');
  } catch (err) {
    console.log('✗ Could not sign in to the mail server.\n');
    console.log(explain(err));
    console.log(`\n  (raw error: ${err.message})\n`);
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log('\n  Pass an address to send a real test message:');
    console.log('    npm run mail:test -- you@example.com\n');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${env.mail.fromName}" <${env.mail.fromAddress || env.mail.user}>`,
      to,
      subject: `${env.store.name} — SMTP test`,
      text: 'If you are reading this, verification codes will reach your customers.',
    });
    console.log(`✓ Test message accepted for ${to} (${info.messageId}).`);
    console.log('  Check the inbox — and the spam folder.\n');
  } catch (err) {
    console.log(`✗ Connected, but sending to ${to} failed.\n`);
    console.log(explain(err));
    console.log('');
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('mail:test failed:', err.message);
  process.exit(1);
});
