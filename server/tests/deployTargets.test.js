'use strict';

/**
 * Whether two addresses count as the same site decides whether the session
 * cookie is sent at all, so the shortcut of "compare the last two labels" is
 * not good enough: under a public suffix like vercel.app, every subdomain is a
 * separate site by design.
 */

const { sameRegistrableSite, MULTI_TENANT_SUFFIXES } = require('../../scripts/predeploy');

describe('sameRegistrableSite', () => {
  it('is true for one host talking to itself', () => {
    expect(sameRegistrableSite('https://freshmeatnepal.com', 'https://freshmeatnepal.com')).toBe(true);
  });

  it('is true across subdomains of a domain someone owns', () => {
    expect(sameRegistrableSite('https://freshmeatnepal.com', 'https://api.freshmeatnepal.com')).toBe(true);
    expect(sameRegistrableSite('https://shop.co.uk', 'https://api.shop.co.uk')).toBe(true);
  });

  it('is false across two deployments on the same free host', () => {
    // The trap: the last two labels match, so a naive check calls these the
    // same site and promises a cookie that browsers will never send.
    expect(sameRegistrableSite('https://fmn-shop.vercel.app', 'https://fmn-api.vercel.app')).toBe(false);
    expect(sameRegistrableSite('https://a.netlify.app', 'https://b.netlify.app')).toBe(false);
    expect(sameRegistrableSite('https://a.onrender.com', 'https://b.onrender.com')).toBe(false);
    expect(sameRegistrableSite('https://a.github.io', 'https://b.github.io')).toBe(false);
  });

  it('is still true when it is literally the same free-host hostname', () => {
    expect(sameRegistrableSite('https://fmn.vercel.app', 'https://fmn.vercel.app')).toBe(true);
  });

  it('is false across different hosts entirely', () => {
    expect(sameRegistrableSite('https://fmn.vercel.app', 'https://fmn-api.onrender.com')).toBe(false);
  });

  it('is false rather than throwing on something that is not a URL', () => {
    expect(sameRegistrableSite('', 'https://freshmeatnepal.com')).toBe(false);
    expect(sameRegistrableSite('not a url', 'https://freshmeatnepal.com')).toBe(false);
    expect(sameRegistrableSite(undefined, undefined)).toBe(false);
  });

  it('ignores the case of the hostname', () => {
    expect(sameRegistrableSite('https://FreshMeatNepal.com', 'https://api.freshmeatnepal.COM')).toBe(true);
  });

  it('covers the free hosts this project is likely to land on', () => {
    ['vercel.app', 'netlify.app', 'onrender.com', 'railway.app', 'fly.dev', 'pages.dev', 'github.io']
      .forEach((suffix) => expect(MULTI_TENANT_SUFFIXES).toContain(suffix));
  });
});
