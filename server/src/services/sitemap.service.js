'use strict';

/**
 * The sitemap and robots.txt, built as strings so both can be tested without a
 * server or a database.
 */

/** Routes that exist whatever is in the catalogue, with how much they matter. */
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop', changefreq: 'daily', priority: '0.9' },
  { path: '/login', changefreq: 'yearly', priority: '0.3' },
  { path: '/register', changefreq: 'yearly', priority: '0.3' },
];

/** Anything behind a sign-in, or that would duplicate the catalogue. */
const DISALLOWED = ['/checkout', '/cart', '/orders', '/profile', '/favourites', '/verify', '/api/'];

/** XML has five characters that cannot appear raw, and a product slug is user data. */
const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const urlEntry = ({ loc, lastmod, changefreq, priority }) =>
  [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');

const buildSitemap = ({ siteUrl, products = [] }) => {
  const base = String(siteUrl || '').replace(/\/$/, '');

  const entries = [
    ...STATIC_ROUTES.map((route) => ({ loc: `${base}${route.path}`, ...route })),
    ...products.map((product) => ({
      loc: `${base}/products/${product.slug}`,
      lastmod: product.updatedAt,
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');
};

const buildRobotsTxt = ({ siteUrl, apiUrl }) => {
  const base = String(siteUrl || '').replace(/\/$/, '');
  const api = String(apiUrl || base).replace(/\/$/, '');

  return [
    'User-agent: *',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    'Allow: /',
    '',
    `Sitemap: ${api}/sitemap.xml`,
    '',
  ].join('\n');
};

module.exports = { buildSitemap, buildRobotsTxt, escapeXml, STATIC_ROUTES, DISALLOWED };
