export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Fresh Meat Nepal';
export const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173';

/** Vite sets this only under `npm run dev`, never in a production build. */
export const IS_DEV = Boolean(import.meta.env.DEV);

export const CATEGORIES = ['Fresh Meat', 'Processed Meat', 'Marinated', 'Offal', 'Seafood'];
export const UNITS = ['kg', 'g', 'piece', 'pack'];
export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

/** Mirrors the server's transition table so the UI only offers legal moves. */
export const NEXT_STATUSES = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const PAYMENT_METHOD_LABELS = {
  esewa: 'eSewa',
  cod: 'Cash on Delivery',
  card: 'Debit / Credit card',
};
