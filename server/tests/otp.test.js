'use strict';

const otp = require('../src/services/otp.service');

describe('Verification codes', () => {
  it('are always 4 digits, including leading zeros', () => {
    const codes = Array.from({ length: 3000 }, () => otp.generateCode());
    expect(codes.every((c) => /^\d{4}$/.test(c))).toBe(true);
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
  });

  it('are drawn across the whole range rather than a narrow band', () => {
    const codes = new Set(Array.from({ length: 3000 }, () => otp.generateCode()));
    // 3000 uniform draws from 10,000 values should yield well over a thousand distinct codes.
    expect(codes.size).toBeGreaterThan(1500);
  });

  it('hash so the stored value never contains the code', async () => {
    const code = '0427';
    const hash = await otp.hashCode(code);

    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await otp.compareCode(code, hash)).toBe(true);
    expect(await otp.compareCode('1427', hash)).toBe(false);
  });

  it('refuses to match when the code or hash is missing', async () => {
    expect(await otp.compareCode('', await otp.hashCode('1234'))).toBe(false);
    expect(await otp.compareCode('1234', '')).toBe(false);
    expect(await otp.compareCode('1234', undefined)).toBe(false);
  });

  it('expires ten minutes out', () => {
    const minutes = (otp.expiryFromNow().getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(otp.CODE_TTL_MINUTES);
  });

  it('reports the remaining resend cooldown', () => {
    expect(otp.cooldownRemaining(null)).toBe(0);
    expect(otp.cooldownRemaining(new Date(Date.now() - 120000))).toBe(0);

    const justSent = otp.cooldownRemaining(new Date());
    expect(justSent).toBeGreaterThan(50);
    expect(justSent).toBeLessThanOrEqual(otp.RESEND_COOLDOWN_SECONDS);
  });

  it('caps guesses well below the 10,000 possible codes', () => {
    expect(otp.MAX_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});

describe('Returning the code in the response', () => {
  /** The flag is read from env at import time, so each case needs a fresh module. */
  const echoWith = (vars) => {
    let result;
    jest.isolateModules(() => {
      const previous = {};
      Object.entries(vars).forEach(([k, v]) => {
        previous[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      });
      // eslint-disable-next-line global-require
      result = require('../src/services/otp.service').shouldEchoCode();
      Object.entries(previous).forEach(([k, v]) => {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      });
    });
    return result;
  };

  const SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' };
  const NO_SMTP = { SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASSWORD: undefined };
  // Exactly what .env.example ships — non-empty, but unusable.
  const PLACEHOLDER_SMTP = {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_USER: 'your-gmail-address@gmail.com',
    SMTP_PASSWORD: 'your-16-char-app-password',
  };

  it('is NEVER allowed in production, even without SMTP', () => {
    expect(echoWith({ NODE_ENV: 'production', ...NO_SMTP })).toBe(false);
    expect(echoWith({ NODE_ENV: 'production', ...SMTP })).toBe(false);
  });

  it('is not allowed in development once SMTP can deliver the code', () => {
    expect(echoWith({ NODE_ENV: 'development', ...SMTP })).toBe(false);
  });

  it('is allowed in development only when there is no way to email it', () => {
    expect(echoWith({ NODE_ENV: 'development', ...NO_SMTP })).toBe(true);
  });

  it('treats the shipped placeholder credentials as no SMTP at all', () => {
    // Otherwise the server tries to send through a fake Gmail account, fails,
    // and withholds the code as well — leaving no way to verify an address.
    expect(echoWith({ NODE_ENV: 'development', ...PLACEHOLDER_SMTP })).toBe(true);
  });

  it('still refuses to echo placeholder-configured servers in production', () => {
    expect(echoWith({ NODE_ENV: 'production', ...PLACEHOLDER_SMTP })).toBe(false);
  });
});
