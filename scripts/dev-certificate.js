'use strict';

/**
 * Makes the certificate that local HTTPS uses.
 *
 * A plain self-signed certificate encrypts the connection perfectly well, but
 * the browser still says "Not secure" — and it is right to. Encryption answers
 * "can anyone read this?"; the padlock answers "is this host who it claims to
 * be?", and nothing on earth vouches for a certificate that signed itself. The
 * browser cannot tell that one apart from an attacker's.
 *
 * So this issues a small two-link chain instead:
 *
 *   Fresh Meat Nepal Local Development CA   (a root you install once)
 *     └── localhost                         (what the three apps serve)
 *
 * Once that root is in the machine's trust store, the chain terminates in
 * something the browser trusts and the padlock is real — the same check a
 * public certificate passes, with you as the authority instead of a CA.
 *
 * THE CA PRIVATE KEY IS NEVER WRITTEN TO DISK. It exists inside this process
 * long enough to sign the leaf and is then gone. That matters: a trusted root's
 * key can mint a valid certificate for *any* hostname, so a stolen one would
 * let someone impersonate your bank to your own browser. A key that was never
 * saved cannot be stolen. The cost is that re-issuing means re-trusting, once
 * a year.
 */

require('reflect-metadata'); // @peculiar/x509 uses decorators and needs this first.

const { webcrypto } = require('crypto');
const x509 = require('@peculiar/x509');

x509.cryptoProvider.set(webcrypto);

const ALG = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
};

/* Chrome refuses a server certificate valid for more than 398 days. The root
   is allowed to outlive it, so re-issuing the leaf next year does not mean
   installing a new root. */
const LEAF_DAYS = 397;
const ROOT_DAYS = 825;
const DAY = 86_400_000;

/** Random, not sequential: a predictable serial is a (small) fingerprinting aid. */
const serialNumber = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex');

const toPem = (der, label) => {
  const body = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
};

/**
 * @param {string[]} hosts  DNS names and IP addresses the certificate covers
 * @returns {Promise<{ ca: string, cert: string, key: string }>} PEM strings
 */
const issue = async (hosts = ['localhost', '127.0.0.1', '::1']) => {
  const now = Date.now();
  // A minute of slack: a clock a few seconds behind would otherwise reject a
  // certificate issued moments ago as not yet valid.
  const notBefore = new Date(now - 60_000);

  const caKeys = await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const ca = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serialNumber(),
    name: 'CN=Fresh Meat Nepal Local Development CA, O=Fresh Meat Nepal, C=NP',
    notBefore,
    notAfter: new Date(now + ROOT_DAYS * DAY),
    signingAlgorithm: ALG,
    keys: caKeys,
    extensions: [
      // pathLenConstraint 0: this root may sign leaves, never another CA.
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const leafKeys = await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: serialNumber(),
    subject: 'CN=localhost, O=Fresh Meat Nepal, C=NP',
    issuer: ca.subject,
    notBefore,
    notAfter: new Date(now + LEAF_DAYS * DAY),
    signingAlgorithm: ALG,
    publicKey: leafKeys.publicKey,
    signingKey: caKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
        true
      ),
      // serverAuth only. This certificate cannot be used to sign code or mail.
      new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1'], false),
      // The names browsers actually check. The legacy Common Name is ignored.
      new x509.SubjectAlternativeNameExtension(
        hosts.map((host) => ({ type: /^[\d.]+$|:/.test(host) ? 'ip' : 'dns', value: host }))
      ),
      await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(ca, false),
    ],
  });

  const key = toPem(await webcrypto.subtle.exportKey('pkcs8', leafKeys.privateKey), 'PRIVATE KEY');

  // caKeys.privateKey goes out of scope here and is never serialised.
  return { ca: ca.toString('pem').trim() + '\n', cert: cert.toString('pem').trim() + '\n', key };
};

module.exports = { issue, LEAF_DAYS, ROOT_DAYS };
