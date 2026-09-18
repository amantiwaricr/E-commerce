'use strict';

const { buildSitemap, buildRobotsTxt, escapeXml, STATIC_ROUTES, DISALLOWED } = require('../src/services/sitemap.service');

describe('sitemap.xml', () => {
  const products = [
    { slug: 'goat-curry-cut', updatedAt: new Date('2026-09-01T10:00:00Z') },
    { slug: 'chicken-breast', updatedAt: new Date('2026-09-14T10:00:00Z') },
  ];

  it('opens with the XML declaration and the sitemap namespace', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('lists every static route and every product', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products });
    STATIC_ROUTES.forEach((route) => {
      expect(xml).toContain(`<loc>https://shop.example.com${route.path}</loc>`);
    });
    expect(xml).toContain('<loc>https://shop.example.com/products/goat-curry-cut</loc>');
    expect(xml).toContain('<loc>https://shop.example.com/products/chicken-breast</loc>');
  });

  it('counts one <url> per entry', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products });
    expect((xml.match(/<url>/g) || []).length).toBe(STATIC_ROUTES.length + products.length);
  });

  it('never doubles the slash when the site URL has a trailing one', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com/', products });
    expect(xml).not.toContain('.com//');
    expect(xml).toContain('<loc>https://shop.example.com/</loc>');
  });

  it('writes lastmod as a plain date, which is what the protocol wants', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products });
    expect(xml).toContain('<lastmod>2026-09-01</lastmod>');
    expect(xml).not.toMatch(/<lastmod>[^<]*T[^<]*<\/lastmod>/);
  });

  it('escapes a slug that would otherwise break the XML', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products: [{ slug: 'beef&lamb' }] });
    expect(xml).toContain('beef&amp;lamb');
    expect(xml).not.toContain('beef&lamb<');
  });

  it('is still valid with an empty catalogue', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products: [] });
    expect((xml.match(/<url>/g) || []).length).toBe(STATIC_ROUTES.length);
  });

  it('omits lastmod rather than writing an empty element', () => {
    const xml = buildSitemap({ siteUrl: 'https://shop.example.com', products: [{ slug: 'x' }] });
    expect(xml).not.toContain('<lastmod></lastmod>');
  });
});

describe('escapeXml', () => {
  it('handles all five reserved characters', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  });
});

describe('robots.txt', () => {
  const robots = buildRobotsTxt({ siteUrl: 'https://shop.example.com', apiUrl: 'https://api.example.com' });

  it('addresses every crawler', () => {
    expect(robots.startsWith('User-agent: *')).toBe(true);
  });

  it('keeps crawlers out of anything behind a sign-in', () => {
    DISALLOWED.forEach((path) => expect(robots).toContain(`Disallow: ${path}`));
    expect(robots).toContain('Disallow: /checkout');
    expect(robots).toContain('Disallow: /orders');
  });

  it('still allows the catalogue', () => {
    expect(robots).toContain('Allow: /');
  });

  it('points at the sitemap with an absolute URL — a relative one is ignored', () => {
    expect(robots).toContain('Sitemap: https://api.example.com/sitemap.xml');
    expect(robots).not.toMatch(/Sitemap: \//);
  });

  it('falls back to the site URL when no API URL is given', () => {
    expect(buildRobotsTxt({ siteUrl: 'https://shop.example.com' })).toContain(
      'Sitemap: https://shop.example.com/sitemap.xml'
    );
  });

  it('does not double the slash before sitemap.xml', () => {
    expect(buildRobotsTxt({ siteUrl: 'https://shop.example.com/' })).toContain(
      'Sitemap: https://shop.example.com/sitemap.xml'
    );
  });
});
