import { useEffect, useState } from 'react';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { useFavourites } from '../context/FavouritesContext';

export default function FavouritesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { ids } = useFavourites();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Signed in, the list comes from the account; as a guest it is resolved from
  // the locally stored ids so the page works either way.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        if (isAuthenticated) {
          const { data } = await api.get('/favourites');
          if (!cancelled) setProducts(data.products);
        } else if (ids.length) {
          const { data } = await api.get('/products', { params: { limit: 60 } });
          if (!cancelled) setProducts(data.products.filter((p) => ids.includes(p._id || p.id)));
        } else if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading, ids]);

  if (loading) return <Loader label="Loading your favourites…" />;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Favourites</h1>
        <span className="muted small">{products.length} saved</span>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          message="Tap the heart on any product to keep it here."
          actionLabel="Browse the shop"
          actionTo="/"
        />
      ) : (
        <div className="grid">
          {products.map((product) => (
            <ProductCard key={product._id || product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
