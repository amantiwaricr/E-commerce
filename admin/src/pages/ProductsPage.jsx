import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { formatNpr } from '../utils/format';
import { CATEGORIES } from '../config';

export default function ProductsPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({
    page: 1,
    category: '',
    availability: params.get('availability') || '',
    // Seeded from the topbar search so a query from any page lands here.
    search: params.get('search') || '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftStock, setDraftStock] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, limit: 20 }).filter(([, v]) => v !== ''));
      const { data } = await api.get('/admin/products', { params });
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // A fresh search from the topbar arrives as a URL change, not a remount.
  const urlSearch = params.get('search') || '';
  useEffect(() => {
    setFilters((f) => (f.search === urlSearch ? f : { ...f, search: urlSearch, page: 1 }));
  }, [urlSearch]);

  const toggleAvailability = async (product) => {
    try {
      await api.patch(`/admin/products/${product._id}/availability`, { isAvailable: !product.isAvailable });
      toast.success(`${product.name} is now ${product.isAvailable ? 'hidden' : 'published'}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /** Saves a stock level edited straight in the table. */
  const saveStock = async (product) => {
    const next = Number(draftStock[product._id]);
    setDraftStock((current) => {
      const { [product._id]: _removed, ...rest } = current;
      return rest;
    });
    if (!Number.isFinite(next) || next < 0 || next === product.stock) return;

    try {
      await api.patch(`/admin/products/${product._id}/stock`, { stock: next });
      toast.success(`${product.name} stock set to ${next} ${product.unit}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/products/${product._id}`);
      toast.success('Product deleted.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="sub">Edit a stock figure straight in the table — it saves when you leave the box.</div>
        </div>
        <Link className="btn" to="/products/new">
          <Icon name="plus" size={15} /> Add product
        </Link>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, page: 1 }))}
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="availability">Availability</label>
          <select
            id="availability"
            value={filters.availability}
            onChange={(e) => setFilters((f) => ({ ...f, availability: e.target.value, page: 1 }))}
          >
            <option value="">All</option>
            <option value="available">Published</option>
            <option value="unavailable">Hidden</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            placeholder="Name or tag"
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <Loader />
      ) : products.length === 0 ? (
        <EmptyState title="No products found" message="Adjust the filters or add your first product." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <div className="cell-product">
                        {product.images?.[0] && <img src={product.images[0]} alt="" />}
                        <div>
                          <strong>{product.name}</strong>
                          <div className="small muted">/{product.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td>{product.category}</td>
                    <td>
                      {formatNpr(product.price)}
                      <span className="small muted"> / {product.unit}</span>
                    </td>
                    <td>
                      <span className="stock-edit">
                        <input
                          type="number"
                          min="0"
                          aria-label={`Stock for ${product.name}`}
                          value={draftStock[product._id] ?? product.stock}
                          onChange={(e) => setDraftStock((d) => ({ ...d, [product._id]: e.target.value }))}
                          onBlur={() => saveStock(product)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        <span className={`badge ${product.stock === 0 ? 'danger' : product.stock <= 5 ? 'warn' : ''}`}>
                          {product.unit}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${product.isAvailable ? 'ok' : 'danger'}`}>
                        {product.isAvailable ? 'Published' : 'Hidden'}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <Link className="btn secondary sm" to={`/products/${product._id}`}>
                          Edit
                        </Link>
                        <button type="button" className="btn secondary sm" onClick={() => toggleAvailability(product)}>
                          {product.isAvailable ? 'Hide' : 'Publish'}
                        </button>
                        <button type="button" className="btn quiet-danger sm" onClick={() => remove(product)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            onChange={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}
    </>
  );
}
