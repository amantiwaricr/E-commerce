'use strict';

/**
 * A connection string that points anywhere but this machine carries credentials
 * and order data across a network, so it must be TLS.
 *
 * `mongodb+srv://` (Atlas) is TLS by default. A plain `mongodb://` to a remote
 * host is not, and failing to notice is how a database ends up in the clear —
 * so TLS is turned on for those unless the URI already says otherwise.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Hosts in the authority section of a MongoDB connection string. */
const hostsOf = (uri = '') => {
  const authority = String(uri)
    .replace(/^mongodb(\+srv)?:\/\//i, '')
    .split('/')[0]
    .split('?')[0];
  const afterCredentials = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return afterCredentials
    .split(',')
    .map((host) => host.split(':')[0].trim().toLowerCase())
    .filter(Boolean);
};

const isLocalUri = (uri = '') => {
  const hosts = hostsOf(uri);
  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
};

/** True when the URI itself already decides the TLS setting. */
const declaresTls = (uri = '') => /[?&](tls|ssl)=/i.test(String(uri));

/**
 * Mongoose options for a URI. Returns `{ tls: true }` for a remote, plain
 * `mongodb://` host and an empty object everywhere else, so a local development
 * database and an explicit choice in the URI are both left alone.
 */
const tlsOptionsFor = (uri = '') => {
  if (/^mongodb\+srv:/i.test(uri)) return {}; // Already TLS by definition.
  if (declaresTls(uri) || isLocalUri(uri)) return {};
  return { tls: true };
};

module.exports = { tlsOptionsFor, isLocalUri, declaresTls, hostsOf };
