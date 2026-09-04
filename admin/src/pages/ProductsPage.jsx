import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';
import { formatNpr } from '../utils/format';
import { CATEGORIES } from '../config';

export default function ProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ page: 1, category: '', availability: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const toggleAvailability = async (product) => {
    try {
      await api.patch(`/admin/products/${product._id}/availability`, { isAvailable: !product.isAvailable });
      toast.success(`${product.name} is now ${product.isAvailable ? 'hidden' : 'published'}.`);
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
        <h1>Products</h1>
        <Link className="btn" to="/products/new">
          Add product
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
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        {product.images?.[0] && (
                          <img
                            src={product.images[0]}
                            alt=""
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                          />
                        )}
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
                      <span className={`badge ${product.stock <= 5 ? 'warn' : ''}`}>
                        {product.stock} {product.unit}
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
                        <button type="button" className="btn danger sm" onClick={() => remove(product)}>
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
