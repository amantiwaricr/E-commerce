import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { DELIVERY_CHARGE, FREE_DELIVERY_THRESHOLD } from '../config';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const CartContext = createContext(null);
const GUEST_CART_KEY = 'fmn_guest_cart';

const readGuestCart = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writeGuestCart = (items) => localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));

/** Mirrors the server's pricing rules so a guest sees the same totals. */
const priceGuestCart = (lines) => {
  const items = lines.map((line) => ({ ...line, subtotal: Number(line.price) * line.quantity }));
  const itemsTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryCharge = itemsTotal > 0 && itemsTotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE : 0;
  return { items, itemsTotal, deliveryCharge, totalAmount: itemsTotal + deliveryCharge };
};

const EMPTY_CART = { items: [], itemsTotal: 0, deliveryCharge: 0, totalAmount: 0 };

export const CartProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();
  const [cart, setCart] = useState(EMPTY_CART);
  const [loading, setLoading] = useState(false);
  const mergedRef = useRef(false);

  const refreshServerCart = useCallback(async () => {
    const { data } = await api.get('/cart');
    setCart(data.cart);
    if (data.cart.removed?.length) {
      toast.notify(`${data.cart.removed.join(', ')} is no longer available and was removed from your cart.`);
    }
    return data.cart;
  }, [toast]);

  // On sign-in, fold the guest cart into the server cart exactly once.
  useEffect(() => {
    if (authLoading) return;

    const sync = async () => {
      if (!isAuthenticated) {
        mergedRef.current = false;
        setCart(priceGuestCart(readGuestCart()));
        return;
      }

      setLoading(true);
      try {
        const guestItems = readGuestCart();
        if (!mergedRef.current && guestItems.length) {
          await api.post('/cart/merge', {
            items: guestItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          });
          writeGuestCart([]);
        }
        mergedRef.current = true;
        await refreshServerCart();
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };

    sync();
    // `toast` is stable per provider; refreshServerCart depends only on it.
  }, [isAuthenticated, authLoading, refreshServerCart, toast]);

  const addItem = useCallback(
    async (product, quantity = 1) => {
      if (!isAuthenticated) {
        const lines = readGuestCart();
        const existing = lines.find((l) => l.productId === product.id || l.productId === product._id);
        const productId = product.id || product._id;
        const nextQuantity = Math.min((existing?.quantity || 0) + quantity, product.stock);

        if (existing) existing.quantity = nextQuantity;
        else
          lines.push({
            productId,
            name: product.name,
            slug: product.slug,
            image: product.images?.[0] || '',
            unit: product.unit,
            price: product.price,
            quantity: nextQuantity,
            stock: product.stock,
            maxQuantity: Math.min(99, product.stock),
          });

        writeGuestCart(lines);
        setCart(priceGuestCart(lines));
        toast.success(`${product.name} added to your cart`);
        return;
      }

      setLoading(true);
      try {
        const { data } = await api.post('/cart/items', { productId: product.id || product._id, quantity });
        setCart(data.cart);
        toast.success(`${product.name} added to your cart`);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, toast]
  );

  const updateItem = useCallback(
    async (productId, quantity) => {
      if (!isAuthenticated) {
        const lines = readGuestCart().map((l) => (l.productId === productId ? { ...l, quantity } : l));
        writeGuestCart(lines);
        setCart(priceGuestCart(lines));
        return;
      }

      setLoading(true);
      try {
        const { data } = await api.patch(`/cart/items/${productId}`, { quantity });
        setCart(data.cart);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, toast]
  );

  const removeItem = useCallback(
    async (productId) => {
      if (!isAuthenticated) {
        const lines = readGuestCart().filter((l) => l.productId !== productId);
        writeGuestCart(lines);
        setCart(priceGuestCart(lines));
        return;
      }

      setLoading(true);
      try {
        const { data } = await api.delete(`/cart/items/${productId}`);
        setCart(data.cart);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, toast]
  );

  const clearCart = useCallback(async () => {
    if (!isAuthenticated) {
      writeGuestCart([]);
      setCart(EMPTY_CART);
      return;
    }
    const { data } = await api.delete('/cart');
    setCart(data.cart);
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      cart,
      loading,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      addItem,
      updateItem,
      removeItem,
      clearCart,
      refreshCart: () => (isAuthenticated ? refreshServerCart() : setCart(priceGuestCart(readGuestCart()))),
    }),
    [cart, loading, addItem, updateItem, removeItem, clearCart, isAuthenticated, refreshServerCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};
