/**
 * Titles and descriptions for the routes that exist regardless of the
 * database. Read twice: by the pages at runtime, and by the pre-render step at
 * build time, so a crawler that does not run JavaScript sees the same words a
 * visitor does.
 *
 * `path` keys are exact routes. Descriptions are written to be read in a
 * search result: roughly 150 characters, saying what the page offers.
 */
export const STATIC_PAGES = {
  '/': {
    title: 'Fresh meat delivered across Kathmandu Valley',
    description:
      'Goat, buff, chicken and seafood cut to order the morning you buy it and delivered chilled across the Kathmandu Valley. Pay by eSewa, card or cash.',
  },
  '/shop': {
    title: 'Meat Market — buy fresh meat online',
    description:
      'Browse fresh cuts, processed meat, marinated lines and seafood with live stock counts. Same-day delivery inside the Valley, or collect at our Balkumari counter.',
  },
  '/cart': {
    title: 'Your basket',
    description: 'Review the cuts in your basket and check out with eSewa, card or cash on delivery.',
    noIndex: true,
  },
  '/favourites': {
    title: 'Your favourites',
    description: 'The cuts you have saved for later.',
    noIndex: true,
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to track an order, reorder a favourite cut, or check out faster.',
  },
  '/register': {
    title: 'Create an account',
    description: 'Create an account to order fresh meat, track deliveries and download your bills.',
  },
  '/verify': { title: 'Verify your email', description: 'Enter the 4-digit code we emailed you.', noIndex: true },
  '/orders': { title: 'Your orders', description: 'Track your orders and download your bills.', noIndex: true },
  '/profile': { title: 'Your profile', description: 'Your details and saved delivery addresses.', noIndex: true },
  '/checkout': { title: 'Checkout', description: 'Confirm your delivery address and pay.', noIndex: true },
  '/checkout/failed': { title: 'Payment not completed', description: 'That payment did not go through.', noIndex: true },
};

/** Routes worth putting in front of a search engine. */
export const INDEXABLE_PATHS = Object.entries(STATIC_PAGES)
  .filter(([, page]) => !page.noIndex)
  .map(([path]) => path);

export const seoFor = (path) => STATIC_PAGES[path] || {};
