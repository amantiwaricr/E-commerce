/**
 * Writes a real HTML file for every static route.
 *
 * The app sets its own head tags at runtime, which satisfies Google — it runs
 * JavaScript before indexing. Social crawlers do not: Facebook, LinkedIn,
 * WhatsApp and Slack read the bytes they are served and never execute a
 * script. Served the SPA's single index.html, every link preview across the
 * whole site would show the same title and description.
 *
 * So after `vite build` this takes dist/index.html and writes dist/shop/index.html,
 * dist/login/index.html and so on, each with its own title, description,
 * canonical URL and Open Graph tags baked into the markup. Static hosts serve
 * `/shop` from `/shop/index.html` without any configuration.
 *
 * Product pages cannot be done this way — they come from the database and
 * change — which is why the API also serves a sitemap listing them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';

import { STATIC_PAGES } from '../src/seo/pages.js';
import { seoFiles } from './seo-files.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

/*
 * Read client/.env the same way Vite does. This script runs as a plain node
 * process after `vite build`, so process.env holds none of it — every canonical
 * URL, Open Graph URL and sitemap entry was being baked as http://localhost:5173
 * unless the variables happened to be exported into the shell by hand.
 */
const env = { ...loadEnv('production', root, ''), ...process.env };

const SITE_URL = (env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
const STORE_NAME = env.VITE_STORE_NAME || 'Fresh Meat Nepal';
const SOCIAL_IMAGE = env.VITE_SOCIAL_IMAGE || `${SITE_URL}/social-card.png`;

const escapeAttr = (value = '') =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const headFor = (routePath, page) => {
  const url = `${SITE_URL}${routePath === '/' ? '/' : routePath}`;
  const title = page.title ? `${page.title} — ${STORE_NAME}` : STORE_NAME;
  const description = page.description || '';

  const tags = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta name="robots" content="${page.noIndex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escapeAttr(SOCIAL_IMAGE)}" />`,
    `<meta property="og:site_name" content="${escapeAttr(STORE_NAME)}" />`,
    `<meta property="og:locale" content="en_NP" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(SOCIAL_IMAGE)}" />`,
  ];

  return tags.join('\n    ');
};

/** Replaces the template's title and description rather than duplicating them. */
const render = (template, routePath, page) =>
  template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, '')
    .replace('</head>', `  ${headFor(routePath, page)}\n  </head>`);

const run = async () => {
  const indexPath = path.join(dist, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('dist/index.html is missing — run `vite build` first.');
    process.exit(1);
  }

  const template = fs.readFileSync(indexPath, 'utf8');
  let written = 0;

  for (const [routePath, page] of Object.entries(STATIC_PAGES)) {
    const html = render(template, routePath, page);
    const target = routePath === '/' ? indexPath : path.join(dist, routePath, 'index.html');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html);
    written += 1;
  }

  const { robots, sitemap, complete } = await seoFiles({ siteUrl: SITE_URL, apiUrl: env.VITE_API_URL });
  fs.writeFileSync(path.join(dist, 'robots.txt'), robots);
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);

  const urls = (sitemap.match(/<loc>/g) || []).length;
  console.log(`  prerendered ${written} routes, robots.txt and sitemap.xml (${urls} urls, site: ${SITE_URL})`);
  if (!complete) {
    console.log('  ! the API was not reachable, so the sitemap holds only the static routes.');
    console.log('    Product pages are still discoverable through the API sitemap, which');
    console.log('    robots.txt lists as a second Sitemap: line.');
  }
  if (SITE_URL.includes('localhost')) {
    console.log('  ! VITE_SITE_URL is localhost — set it to the public address before deploying.');
  }
};

run();
