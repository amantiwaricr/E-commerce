import { useEffect } from 'react';
import { SITE_URL, SOCIAL_IMAGE, STORE_NAME } from '../config';

/**
 * Sets a page's title, description, canonical URL, social tags and structured
 * data, and puts them back when the page unmounts.
 *
 * This runs in the browser, which is enough for Google — it executes
 * JavaScript before indexing. It is *not* enough for social crawlers
 * (Facebook, LinkedIn, WhatsApp, Slack), which read the raw HTML and never run
 * scripts. Those are served by the per-route HTML that `npm run build` writes;
 * see client/scripts/prerender.js. Both read seo/pages.js so they agree.
 */

const MANAGED = 'data-seo';

const upsert = (selector, create, attrs) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    el.setAttribute(MANAGED, '');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
  return el;
};

const meta = (name, content) => {
  if (!content) return;
  upsert(`meta[name="${name}"]`, () => document.createElement('meta'), { name, content });
};

const property = (prop, content) => {
  if (!content) return;
  upsert(`meta[property="${prop}"]`, () => document.createElement('meta'), { property: prop, content });
};

/** Absolute URL for a path — what canonical and og:url both require. */
export const absolute = (path = '/') =>
  /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export default function useSeo({
  title,
  description,
  path,
  image = SOCIAL_IMAGE,
  type = 'website',
  noIndex = false,
  jsonLd,
} = {}) {
  const structured = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const fullTitle = title ? `${title} — ${STORE_NAME}` : STORE_NAME;
    const url = absolute(path ?? window.location.pathname);

    document.title = fullTitle;

    meta('description', description);
    // Pages behind a sign-in, and the 404, have nothing to offer an index.
    meta('robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    upsert('link[rel="canonical"]', () => {
      const link = document.createElement('link');
      link.rel = 'canonical';
      return link;
    }, { href: url });

    property('og:title', fullTitle);
    property('og:description', description);
    property('og:url', url);
    property('og:type', type);
    property('og:image', image);
    property('og:site_name', STORE_NAME);
    property('og:locale', 'en_NP');

    meta('twitter:card', 'summary_large_image');
    meta('twitter:title', fullTitle);
    meta('twitter:description', description);
    meta('twitter:image', image);

    let script;
    if (structured) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute(MANAGED, '');
      script.textContent = structured;
      document.head.appendChild(script);
    }

    // Structured data describes one page only and must not outlive it.
    return () => script?.remove();
  }, [title, description, path, image, type, noIndex, structured]);
}
