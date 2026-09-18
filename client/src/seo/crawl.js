/**
 * robots.txt and sitemap.xml for the storefront's own origin.
 *
 * Both are derived from STATIC_PAGES rather than written out again, because a
 * hand-kept second copy of the route list is a copy that drifts: this file and
 * the server's used to disagree about whether /api/ was disallowed and about
 * which origin the sitemap lived on. A page marked `noIndex` is disallowed in
 * robots.txt and left out of the sitemap, from the one declaration.
 *
 * The API serves its own pair on its own origin — that one can list products,
 * because it can read the database. This one always exists, which matters more:
 * a robots.txt advertising a sitemap that 404s is worse than a small sitemap.
 */

import { STATIC_PAGES } from './pages.js';

/** Signed-in pages and anything that would duplicate the catalogue. */
export const disallowedPaths = () => [
  ...Object.entries(STATIC_PAGES)
    .filter(([, page]) => page.noIndex)
    .map(([path]) => path),
  '/api/',
];

/** The routes worth indexing, with how often they change and how much they matter. */
const WEIGHTS = {
  '/': { changefreq: 'daily', priority: '1.0' },
  '/shop': { changefreq: 'daily', priority: '0.9' },
};
const DEFAULT_WEIGHT = { changefreq: 'yearly', priority: '0.3' };

export const indexablePaths = () =>
  Object.entries(STATIC_PAGES)
    .filter(([, page]) => !page.noIndex)
    .map(([path]) => path);

const trimSlash = (value) => String(value || '').replace(/\/+$/, '');

/** XML has five characters that cannot appear raw, and a product slug is user data. */
export const escapeXml = (value = '') =>
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

/**
 * @param siteUrl   the storefront's public origin
 * @param products  optional `{ slug, updatedAt }` list; absent when the API
 *                  could not be reached at build time
 */
export const buildSitemap = ({ siteUrl, products = [] }) => {
  const base = trimSlash(siteUrl);

  const entries = [
    ...indexablePaths().map((path) => ({ loc: `${base}${path}`, ...(WEIGHTS[path] || DEFAULT_WEIGHT) })),
    ...products
      .filter((product) => product && product.slug)
      .map((product) => ({
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

/**
 * @param apiUrl  the API origin, listed as a second sitemap when it differs.
 *                The robots.txt spec allows any number of Sitemap lines, and
 *                the API's is the one that carries product pages — so a build
 *                that could not reach the API still tells crawlers where the
 *                full list lives.
 */
export const buildRobotsTxt = ({ siteUrl, apiUrl } = {}) => {
  const base = trimSlash(siteUrl);
  const api = trimSlash(apiUrl);

  const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(url);

  const sitemaps = [`${base}/sitemap.xml`];
  // A deployed robots.txt must never point a crawler at localhost. That happens
  // when the site URL was set for production but VITE_API_URL was left as the
  // development default, which is easy to do and invisible until a crawler
  // reports a dead sitemap.
  if (api && api !== base && !(isLocal(api) && !isLocal(base))) sitemaps.push(`${api}/sitemap.xml`);

  return [
    'User-agent: *',
    ...disallowedPaths().map((path) => `Disallow: ${path}`),
    'Allow: /',
    '',
    ...sitemaps.map((url) => `Sitemap: ${url}`),
    '',
  ].join('\n');
};
