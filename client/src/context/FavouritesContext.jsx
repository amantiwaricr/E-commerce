import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const FavouritesContext = createContext(null);
const GUEST_KEY = 'fmn_guest_favourites';

const readGuest = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writeGuest = (ids) => localStorage.setItem(GUEST_KEY, JSON.stringify(ids));

/**
 * Saved products. Guests keep them in localStorage; signing in merges that list
 * into the account so nothing is lost.
 */
export const FavouritesProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();
  const [ids, setIds] = useState([]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setIds(readGuest());
      return;
    }

    const sync = async () => {
      try {
        const pending = readGuest();
        if (pending.length) {
          await Promise.all(pending.map((id) => api.post(`/favourites/${id}`).catch(() => null)));
          writeGuest([]);
        }
        const { data } = await api.get('/favourites');
        // Never let an unexpected response shape white-screen the whole app:
        // this list is read by the top bar, which renders on every page.
        setIds(Array.isArray(data.ids) ? data.ids : []);
      } catch {
        setIds([]);
      }
    };

    sync();
  }, [isAuthenticated, authLoading]);

  const toggle = useCallback(
    async (productId) => {
      const on = ids.includes(productId);
      const next = on ? ids.filter((id) => id !== productId) : [...ids, productId];
      setIds(next); // optimistic

      if (!isAuthenticated) {
        writeGuest(next);
        return;
      }

      try {
        const { data } = on
          ? await api.delete(`/favourites/${productId}`)
          : await api.post(`/favourites/${productId}`);
        setIds(Array.isArray(data.ids) ? data.ids : next);
      } catch (err) {
        setIds(ids); // roll back
        toast.error(err.message);
      }
    },
    [ids, isAuthenticated, toast]
  );

  const value = useMemo(
    () => ({ ids, isFavourite: (id) => ids.includes(id), toggle }),
    [ids, toggle]
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
};

export const useFavourites = () => {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error('useFavourites must be used inside <FavouritesProvider>');
  return ctx;
};
