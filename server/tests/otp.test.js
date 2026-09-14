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
  /** The production gate is read from env at import time. */
  const canReveal = (nodeEnv, delivered) => {
    let result;
    jest.isolateModules(() => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      // eslint-disable-next-line global-require
      result = require('../src/services/otp.service').canRevealCode({ delivered });
      process.env.NODE_ENV = previous;
    });
    return result;
  };

  it('is NEVER allowed in production, delivered or not', () => {
    expect(canReveal('production', false)).toBe(false);
    expect(canReveal('production', true)).toBe(false);
  });

  it('is not allowed once the email actually reached the customer', () => {
    expect(canReveal('development', true)).toBe(false);
  });

  it('is allowed in development whenever the email did not go out', () => {
    // Covers both no SMTP at all and a send that failed on bad credentials —
    // otherwise a wrong password leaves someone with no code by any route.
    expect(canReveal('development', false)).toBe(true);
  });
});
