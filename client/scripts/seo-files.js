/**
 * Produces robots.txt and sitemap.xml for the storefront, for both the dev
 * server and the build. Shared so the two cannot drift apart.
 */

import http from 'node:http';
import https from 'node:https';

import { buildRobotsTxt, buildSitemap } from '../src/seo/crawl.js';

/**
 * Asks the API for its sitemap, which is the complete one — it can read the
 * catalogue, so it lists every product page as well as the static routes, and
 * it already writes them against the storefront's public URL.
 *
 * Returns `null` rather than throwing when the API is not there. A build in CI
 * has no API and no database, and a sitemap of the static routes alone is still
 * a valid sitemap; far better than a Sitemap: line pointing at a 404.
 *
 * `rejectUnauthorized` is relaxed for localhost only. There the certificate is
 * the local development one, and the alternative is the dev server being unable
 * to describe itself.
 */
export const fetchApiSitemap = (apiUrl, { timeout = 3000 } = {}) =>
  new Promise((resolve) => {
    let target;
    try {
      target = new URL('/sitemap.xml', apiUrl);
    } catch {
      return resolve(null);
    }

    const client = target.protocol === 'https:' ? https : http;
    const localhost = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(target.hostname);

    const req = client.get(target, { timeout, rejectUnauthorized: !localhost }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body.includes('<urlset') ? body : null));
      return undefined;
    });

    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * @returns `{ robots, sitemap, complete }` — `complete` is false when the
 *          sitemap holds only the static routes because the API was silent.
 */
export const seoFiles = async ({ siteUrl, apiUrl }) => {
  const apiOrigin = originOf(apiUrl);
  const fromApi = apiOrigin ? await fetchApiSitemap(apiOrigin) : null;

  return {
    robots: buildRobotsTxt({ siteUrl, apiUrl: apiOrigin }),
    sitemap: fromApi || buildSitemap({ siteUrl }),
    complete: Boolean(fromApi),
  };
};
