import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import { CATEGORIES } from '../config';

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') || '');

  const filters = useMemo(
    () => ({
      page: Number(searchParams.get('page')) || 1,
      limit: 12,
      category: searchParams.get('category') || '',
      search: searchParams.get('search') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      availability: searchParams.get('availability') || '',
      sort: searchParams.get('sort') || 'newest',
    }),
    [searchParams]
  );

  useEffect(() => {
    setLoading(true);
    setError('');

    // Empty values are dropped so the API only sees the filters actually set.
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value != null));

    api
      .get('/products', { params })
      .then(({ data }) => {
        setProducts(data.products);
        setPagination(data.pagination);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  /** Writes a filter into the URL so results stay shareable and back-navigable. */
  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, value);
    });
    if (!('page' in patch)) next.delete('page');
    setSearchParams(next);
  };

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Our catalogue</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {pagination.total ?? 0} product{pagination.total === 1 ? '' : 's'} available
          </p>
        </div>

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ search: searchDraft.trim() });
          }}
        >
          <input
            type="search"
            placeholder="Search khasi, buff, sausage…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 220 }}
            aria-label="Search products"
          />
          <button className="btn secondary" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="chip-row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`chip ${!filters.category ? 'selected' : ''}`}
          onClick={() => setFilter({ category: '' })}
        >
          All
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`chip ${filters.category === category ? 'selected' : ''}`}
            onClick={() => setFilter({ category })}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="minPrice">Min price (Rs.)</label>
          <input
            id="minPrice"
            type="number"
            min="0"
            value={filters.minPrice}
            onChange={(e) => setFilter({ minPrice: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="maxPrice">Max price (Rs.)</label>
          <input
            id="maxPrice"
            type="number"
            min="0"
            value={filters.maxPrice}
            onChange={(e) => setFilter({ maxPrice: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="availability">Availability</label>
          <select
            id="availability"
            value={filters.availability}
            onChange={(e) => setFilter({ availability: e.target.value })}
          >
            <option value="">All products</option>
            <option value="in-stock">In stock only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            <option value="newest">Newest first</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setSearchDraft('');
            setSearchParams(new URLSearchParams());
          }}
        >
          Reset
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <Loader />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match those filters"
          message="Try widening the price range or clearing the search."
        />
      ) : (
        <>
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} onChange={(page) => setFilter({ page })} />
        </>
      )}
    </div>
  );
}
