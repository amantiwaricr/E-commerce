import { SITE_URL, STORE_ADDRESS, STORE_NAME, SUPPORT_EMAIL, SUPPORT_PHONE } from '../config';

/**
 * schema.org JSON-LD. This is what turns a plain blue link into a result with
 * a price, a rating and a stock state attached, so it is built from the real
 * record rather than from anything decorative on the page.
 *
 * Every builder returns a plain object; nothing here touches the DOM.
 */

const abs = (path = '/') => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`);

/** The shop itself: a physical butcher with a counter and opening hours. */
export const organisation = () => ({
  '@context': 'https://schema.org',
  '@type': 'Butcher',
  '@id': `${SITE_URL}/#shop`,
  name: STORE_NAME,
  url: SITE_URL,
  image: `${SITE_URL}/social-card.png`,
  telephone: SUPPORT_PHONE,
  email: SUPPORT_EMAIL,
  priceRange: 'Rs',
  currenciesAccepted: 'NPR',
  paymentAccepted: 'eSewa, Credit Card, Debit Card, Cash on Delivery',
  address: {
    '@type': 'PostalAddress',
    streetAddress: STORE_ADDRESS.line1,
    addressLocality: 'Lalitpur',
    addressRegion: 'Bagmati Province',
    addressCountry: 'NP',
  },
  areaServed: { '@type': 'Place', name: 'Kathmandu Valley' },
});

/** Lets Google offer a search box straight into the catalogue. */
export const website = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: STORE_NAME,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/shop?search={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
});

/**
 * A product's offer. `availability` must reflect the live stock: a result that
 * promises something out of stock is worse for a shopper than no result.
 */
export const product = (item) => {
  const inStock = item.isAvailable && item.stock > 0;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.description,
    sku: item.slug,
    category: item.category,
    ...(item.images?.length ? { image: item.images.map(abs) } : {}),
    brand: { '@type': 'Brand', name: STORE_NAME },
    offers: {
      '@type': 'Offer',
      url: abs(`/products/${item.slug}`),
      priceCurrency: 'NPR',
      price: String(item.price),
      availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE_URL}/#shop` },
    },
  };

  // Only claim a rating when there are reviews behind it — an invented one is
  // both a lie and a manual penalty.
  if (item.rating > 0 && item.reviewCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(item.rating),
      reviewCount: String(item.reviewCount),
    };
  }

  return schema;
};

/** The trail shown under a search result. */
export const breadcrumbs = (trail = []) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: abs(crumb.path),
  })),
});

/** A results page, so the listing itself can be understood as a list. */
export const itemList = (items = []) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  numberOfItems: items.length,
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: abs(`/products/${item.slug}`),
    name: item.name,
  })),
});

export { abs };
