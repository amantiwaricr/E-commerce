export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Vite sets this only when running `npm run dev`, never in a production build. */
export const IS_DEV = Boolean(import.meta.env.DEV);

export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Fresh Meat Nepal';
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '+977-9800000000';

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
