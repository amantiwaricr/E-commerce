'use strict';

/**
 * Tests the storefront's robots.txt / sitemap.xml builder.
 *
 * That module is ESM — the client is a Vite app — and this suite runs as CJS,
 * so it is evaluated in a real node ESM loader in a child process rather than
 * through a transform. It tests the file the build actually imports, not a
 * rewritten copy of it.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const CRAWL = path.resolve(__dirname, '../../client/src/seo/crawl.js');
const PAGES = path.resolve(__dirname, '../../client/src/seo/pages.js');

/** Runs `body` with the crawl module in scope and returns whatever it resolves to. */
const evaluate = (body) => {
  const script = `
    const crawl = await import(${JSON.stringify(CRAWL)});
    const pages = await import(${JSON.stringify(PAGES)});
    const result = await (async () => { ${body} })();
    process.stdout.write(JSON.stringify(result));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
};

const SITE = 'https://freshmeatnepal.com';

describe('storefront robots.txt', () => {
  it('disallows exactly the pages marked noIndex, plus the API', () => {
    const { disallowed, noIndex } = evaluate(`
      return {
        disallowed: crawl.disallowedPaths(),
        noIndex: Object.entries(pages.STATIC_PAGES).filter(([, p]) => p.noIndex).map(([k]) => k),
      };
    `);

    expect(disallowed).toEqual([...noIndex, '/api/']);
    // The whole point of deriving it: a signed-in page cannot be forgotten.
    expect(disallowed).toEqual(expect.arrayContaining(['/checkout', '/orders', '/profile']));
  });

  it('never points a deployed site at a localhost sitemap', () => {
    const lines = evaluate(`
      return crawl.buildRobotsTxt({ siteUrl: '${SITE}', apiUrl: 'https://localhost:5001' })
        .split('\\n').filter((l) => l.startsWith('Sitemap:'));
    `);
    expect(lines).toEqual([`Sitemap: ${SITE}/sitemap.xml`]);
  });

  it('lists the API sitemap as well when both are public', () => {
    const lines = evaluate(`
      return crawl.buildRobotsTxt({ siteUrl: '${SITE}', apiUrl: 'https://api.freshmeatnepal.com' })
        .split('\\n').filter((l) => l.startsWith('Sitemap:'));
    `);
    expect(lines).toEqual([
      `Sitemap: ${SITE}/sitemap.xml`,
      'Sitemap: https://api.freshmeatnepal.com/sitemap.xml',
    ]);
  });

  it('does not list the same origin twice', () => {
    const lines = evaluate(`
      return crawl.buildRobotsTxt({ siteUrl: '${SITE}', apiUrl: '${SITE}' })
        .split('\\n').filter((l) => l.startsWith('Sitemap:'));
    `);
    expect(lines).toHaveLength(1);
  });
});

describe('storefront sitemap.xml', () => {
  it('lists the indexable routes and no others', () => {
    const { locs, indexable } = evaluate(`
      const xml = crawl.buildSitemap({ siteUrl: '${SITE}' });
      return {
        locs: [...xml.matchAll(/<loc>(.*?)<\\/loc>/g)].map((m) => m[1]),
        indexable: crawl.indexablePaths(),
      };
    `);

    expect(locs).toEqual(indexable.map((p) => `${SITE}${p}`));
    expect(locs.join(' ')).not.toMatch(/\/checkout|\/orders|\/profile/);
  });

  it('includes product pages with their last-modified date', () => {
    const xml = evaluate(`
      return crawl.buildSitemap({
        siteUrl: '${SITE}',
        products: [{ slug: 'goat-curry-cut', updatedAt: '2026-09-01T10:00:00.000Z' }],
      });
    `);

    expect(xml).toContain(`<loc>${SITE}/products/goat-curry-cut</loc>`);
    expect(xml).toContain('<lastmod>2026-09-01</lastmod>');
  });

  /* A slug is user data: it reaches this file from the database. */
  it('escapes a slug that would otherwise break the XML', () => {
    const xml = evaluate(`
      return crawl.buildSitemap({ siteUrl: '${SITE}', products: [{ slug: 'a&b<c>"d' }] });
    `);

    expect(xml).toContain('a&amp;b&lt;c&gt;&quot;d');

    // No raw markup character survives inside a <loc>, and every & opens an
    // entity — the two ways a slug could otherwise break the document.
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    locs.forEach((loc) => {
      expect(loc).not.toMatch(/[<>"']/);
      expect(loc).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
    });
  });

  it('skips a product with no slug rather than emitting a broken URL', () => {
    const locs = evaluate(`
      const xml = crawl.buildSitemap({ siteUrl: '${SITE}', products: [{ slug: '' }, null, { slug: 'ok' }] });
      return [...xml.matchAll(/<loc>(.*?)<\\/loc>/g)].map((m) => m[1]);
    `);
    expect(locs.filter((l) => l.includes('/products/'))).toEqual([`${SITE}/products/ok`]);
  });

  it('is valid XML with a single urlset root', () => {
    const xml = evaluate(`return crawl.buildSitemap({ siteUrl: '${SITE}' });`);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect((xml.match(/<urlset/g) || []).length).toBe(1);
    expect((xml.match(/<url>/g) || []).length).toBe((xml.match(/<\/url>/g) || []).length);
  });
});

describe('the two robots.txt builders agree', () => {
  /*
   * The API serves its own pair on its own origin. The lists used to drift —
   * one disallowed /api/ and the other did not, and they named different
   * sitemap origins. Neither can be the authority for the other, so assert the
   * overlap instead of sharing the code across two deployables.
   */
  it('the storefront disallows everything the API does', () => {
    const { DISALLOWED } = require('../src/services/sitemap.service');
    const disallowed = evaluate('return crawl.disallowedPaths();');

    expect(disallowed).toEqual(expect.arrayContaining(DISALLOWED));
  });
});
