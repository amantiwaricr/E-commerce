'use strict';

const { env } = require('../config/env');

/**
 * TLS termination almost always happens in front of this process (nginx,
 * Render, Fly, a load balancer), so the app sees plain HTTP and has to read
 * the proxy's header to know what the client actually used.
 *
 * `app.set('trust proxy', 1)` makes Express populate `req.secure` from
 * `X-Forwarded-Proto`, and that is what these helpers read.
 */

/** Whether the original request reached the proxy over TLS. */
const isSecureRequest = (req) => Boolean(req.secure) || req.get('x-forwarded-proto') === 'https';

/**
 * Sends plain-HTTP traffic to the HTTPS URL of the same resource.
 *
 * Only GET and HEAD are redirected: a 30x on a POST would either drop the body
 * or replay it, and silently replaying a checkout is worse than refusing it.
 * Anything else over plain HTTP is rejected outright.
 */
const enforceHttps = (req, res, next) => {
  if (!env.https.enforce || isSecureRequest(req)) return next();

  // Load balancers and uptime checks hit this over HTTP by design.
  if (req.path === '/api/health') return next();

  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  }

  return res.status(403).json({
    success: false,
    message: 'This API is HTTPS-only. Re-send the request over https://',
  });
};

/**
 * HSTS tells a browser never to speak plain HTTP to this host again. It is
 * meaningless — and a foot-gun on a host that is not fully TLS-ready — unless
 * HTTPS is genuinely enforced, so it is configured alongside the redirect.
 */
const hstsOptions = () => ({
  maxAge: env.https.hstsMaxAge,
  includeSubDomains: env.https.hstsIncludeSubDomains,
  preload: env.https.hstsPreload,
});

module.exports = { enforceHttps, isSecureRequest, hstsOptions };
