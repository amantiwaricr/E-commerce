import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import CategoryChips from '../components/CategoryChips';
import ProductCard from '../components/ProductCard';
import FeatureCard from '../components/FeatureCard';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import PriceRangeFilter from '../components/filters/PriceRangeFilter';
import StarRatingFilter from '../components/filters/StarRatingFilter';
import TagFilter from '../components/filters/TagFilter';
import DeliveryOptions from '../components/filters/DeliveryOptions';
import { SlidersIcon } from '../components/icons';
import { useCart } from '../context/CartContext';

const PAGE_SIZE = 12;

/** Card-shaped placeholders so the grid does not collapse while loading. */
const GridSkeleton = () => (
  <div className="grid">
    {Array.from({ length: 6 }).map((_, i) => (
      <div className="pcard" key={i}>
        <div className="skel" style={{ aspectRatio: '1 / .92' }} />
        <div className="pcard-body">
          <div className="skel" style={{ height: 13, borderRadius: 6 }} />
          <div className="skel" style={{ height: 30, borderRadius: 999, width: '60%', margin: '0 auto' }} />
        </div>
      </div>
    ))}
  </div>
);

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { deliveryMethod, setDeliveryMethod } = useCart();

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [facets, setFacets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The URL is the single source of truth, so every view is shareable.
  const filters = useMemo(
    () => ({
      page: Number(searchParams.get('page')) || 1,
      category: searchParams.get('category') || '',
      search: searchParams.get('search') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      minRating: searchParams.get('minRating') || '',
      tags: searchParams.get('tags') ? searchParams.get('tags').split(',') : [],
      sort: searchParams.get('sort') || 'newest',
    }),
    [searchParams]
  );

  const patch = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      const empty = value === '' || value == null || (Array.isArray(value) && value.length === 0);
      if (empty) next.delete(key);
      else next.set(key, Array.isArray(value) ? value.join(',') : value);
    });
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next);
  };

  useEffect(() => {
    api
      .get('/products/facets')
      .then(({ data }) => setFacets(data.facets))
      .catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');

    const params = { limit: PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      const empty = value === '' || value == null || (Array.isArray(value) && value.length === 0);
      if (!empty) params[key] = Array.isArray(value) ? value.join(',') : value;
    });

    api
      .get('/products', { params })
      .then(({ data }) => {
        setProducts(data.products);
        setPagination(data.pagination);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const price = facets?.price;
  // The featured product takes the hero tile; on later pages everything is a card.
  const featuredIndex = filters.page === 1 ? products.findIndex((p) => p.isFeatured) : -1;

  return (
    <>
      <CategoryChips value={filters.category} onChange={(category) => patch({ category })} />

      <button type="button" className="btn secondary sm filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
        <SlidersIcon width={16} height={16} />
        {filtersOpen ? 'Hide filters' : 'Filters'}
      </button>

      <div className="browse">
        <aside className={`filters ${filtersOpen ? 'open' : ''}`} aria-label="Product filters">
          {price && (
            <PriceRangeFilter
              bounds={price}
              average={price.average}
              histogram={price.histogram}
              value={{
                from: filters.minPrice ? Number(filters.minPrice) : price.min,
                to: filters.maxPrice ? Number(filters.maxPrice) : price.max,
              }}
              onChange={({ from, to }) => patch({ minPrice: String(from), maxPrice: String(to) })}
              onReset={() => patch({ minPrice: '', maxPrice: '' })}
            />
          )}

          <StarRatingFilter
            options={facets?.ratings}
            value={filters.minRating}
            onChange={(minRating) => patch({ minRating: minRating ? String(minRating) : '' })}
          />

          <TagFilter
            tags={facets?.tags || []}
            value={filters.tags}
            onChange={(tags) => patch({ tags })}
            onReset={() => patch({ tags: [] })}
          />

          <DeliveryOptions value={deliveryMethod} onChange={setDeliveryMethod} />
        </aside>

        <section>
          {error && <div className="alert error">{error}</div>}

          {loading ? (
            <GridSkeleton />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products match those filters"
              message="Try widening the price range or clearing the search."
            />
          ) : (
            <>
              <div className="grid">
                {products.map((product, index) =>
                  index === featuredIndex ? (
                    <FeatureCard key={product._id || product.id} product={product} />
                  ) : (
                    <ProductCard key={product._id || product.id} product={product} />
                  )
                )}
              </div>
              <Pagination page={pagination.page} pages={pagination.pages} onChange={(page) => patch({ page })} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
