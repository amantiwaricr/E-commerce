export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Vite sets this only when running `npm run dev`, never in a production build. */
export const IS_DEV = Boolean(import.meta.env.DEV);

/**
 * The site's own public address. Canonical URLs, Open Graph tags and the
 * sitemap all need an absolute URL, and a relative one is worse than none:
 * search engines and social crawlers simply drop it.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');

/** Wide image used when a page is shared on social media (1200×630 works everywhere). */
export const SOCIAL_IMAGE = import.meta.env.VITE_SOCIAL_IMAGE || `${SITE_URL}/social-card.png`;

export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Fresh Meat Nepal';
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '+977-9800000000';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'hello@freshmeatnepal.com';

/** Where the shop physically is — shown on the landing page and in the footer. */
export const STORE_ADDRESS = {
  line1: import.meta.env.VITE_STORE_ADDRESS_LINE1 || 'Balkumari Chowk, Balkumari',
  line2: import.meta.env.VITE_STORE_ADDRESS_LINE2 || 'Lalitpur 44700, Bagmati Province, Nepal',
  hours: import.meta.env.VITE_STORE_HOURS || 'Sunday to Friday, 7:00 AM – 8:00 PM · Saturday, 7:00 AM – 2:00 PM',
  /* The utility strip has room for one line only. */
  hoursShort: import.meta.env.VITE_STORE_HOURS_SHORT || 'Open Daily : 7:00 AM – 8:00 PM',
};

/**
 * The map is embedded keyless via `maps.google.com/maps?output=embed`, which
 * needs no API key or billing account. Set VITE_STORE_MAP_EMBED_URL to a full
 * Google Maps Embed API URL if you later want a keyed, styled map instead.
 */
export const STORE_MAP_QUERY =
  import.meta.env.VITE_STORE_MAP_QUERY || 'Balkumari Chowk, Balkumari, Lalitpur, Nepal';

export const STORE_MAP_EMBED_URL =
  import.meta.env.VITE_STORE_MAP_EMBED_URL ||
  `https://maps.google.com/maps?q=${encodeURIComponent(STORE_MAP_QUERY)}&z=16&output=embed`;

/** Opens the same place in the Maps app, where directions actually work. */
export const STORE_MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  STORE_MAP_QUERY
)}`;

export const STORE_DIRECTIONS_LINK = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  STORE_MAP_QUERY
)}`;

/**
 * Landing-page hero photograph. Leave unset and the best-rated product's image
 * is used instead; set it to a wide, dark shot for the intended look.
 */
export const HERO_IMAGE = import.meta.env.VITE_HERO_IMAGE || '';

export const CATEGORIES = ['Fresh Meat', 'Processed Meat', 'Marinated', 'Offal', 'Seafood'];

export const ORDER_STATUS_FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export const PAYMENT_METHOD_LABELS = {
  esewa: 'eSewa',
  cod: 'Cash on Delivery',
  card: 'Debit / Credit card',
};

// Guest-cart preview only — the server always re-computes these at checkout.
export const DELIVERY_CHARGE = Number(import.meta.env.VITE_DELIVERY_CHARGE || 100);
export const FREE_DELIVERY_THRESHOLD = Number(import.meta.env.VITE_FREE_DELIVERY_THRESHOLD || 3000);
