'use strict';

const NEPAL_COUNTRY_CODE = '977';

/**
 * Normalises a Nepali phone number to E.164 digits without the leading `+`
 * (e.g. `9801234567` → `9779801234567`), which is what WhatsApp providers expect.
 * Returns null when the input cannot be a valid mobile number.
 */
const toWhatsAppNumber = (raw) => {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;

  digits = digits.replace(/^0+/, '');
  if (digits.startsWith(NEPAL_COUNTRY_CODE)) {
    const local = digits.slice(NEPAL_COUNTRY_CODE.length);
    return local.length >= 9 ? digits : null;
  }
  // A bare 10-digit Nepali mobile number (98…/97…/96…) gets the country code.
  if (/^9\d{9}$/.test(digits)) return `${NEPAL_COUNTRY_CODE}${digits}`;
  // Already an international number from another country — pass through.
  return digits.length >= 10 ? digits : null;
};

const isValidNepaliPhone = (raw) => {
  const digits = String(raw || '').replace(/[^\d]/g, '').replace(/^0+/, '');
  const local = digits.startsWith(NEPAL_COUNTRY_CODE) ? digits.slice(NEPAL_COUNTRY_CODE.length) : digits;
  return /^9[678]\d{8}$/.test(local);
};

module.exports = { toWhatsAppNumber, isValidNepaliPhone, NEPAL_COUNTRY_CODE };
