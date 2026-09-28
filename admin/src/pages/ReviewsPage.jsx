import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import Card from '../components/Card';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/format';

const STAR_PATH = 'm12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9Z';

/** Whole stars, filled in ink: the admin panel stays monochrome. */
function RatingStars({ value, size = 14 }) {
  return (
    <span className="rating-stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={n <= Math.round(value) ? 'on' : ''}>
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = {
    page: Number(params.get('page')) || 1,
    stars: params.get('stars') || '',
    status: params.get('status') || '',
    search: params.get('search') || '',
    product: params.get('product') || '',
  };
  const [draft, setDraft] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, value);
    });
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = Object.fromEntries(Object.entries({ ...filters, limit: 20 }).filter(([, v]) => v !== ''));
      const { data: body } = await api.get('/admin/reviews', { params: query });
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // The URL is the single source of truth for the filter set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (draft === filters.search) return undefined;
    const timer = setTimeout(() => setFilter({ search: draft.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const toggleHidden = async (review) => {
    if (!review.isHidden && !window.confirm('Hide this review? It will disappear from the storefront and stop counting towards the rating.')) return;
    setBusyId(review.id);
    try {
      await api.patch(`/admin/reviews/${review.id}`, { isHidden: !review.isHidden });
      toast.success(review.isHidden ? 'Review is visible again.' : 'Review hidden.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const summary = data?.summary;
  const biggest = Math.max(1, ...Object.values(summary?.distribution || {}));
  const productName = filters.product && data?.reviews[0]?.product?.name;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reviews</h1>
          <div className="sub">
            Ratings from customers who received the product. Hide anything abusive; it stops counting towards the rating.
          </div>
        </div>
      </div>

      {summary && (
        <div className="inv-top">
          <div className="stat-grid">
            <div className="stat accent">
              <div className="label">Average rating</div>
              <div className="value">{summary.count ? summary.average.toFixed(1) : '—'}</div>
              <div className="foot">{summary.count ? <RatingStars value={summary.average} /> : 'No ratings yet'}</div>
            </div>
            <div className="stat">
              <div className="label">Ratings</div>
              <div className="value">{summary.count}</div>
              <div className="foot">Visible on the storefront</div>
            </div>
            <div className="stat">
              <div className="label">Five stars</div>
              <div className="value">{summary.count ? `${Math.round((summary.distribution[5] / summary.count) * 100)}%` : '—'}</div>
              <div className="foot">{summary.distribution[5]} of {summary.count}</div>
            </div>
            <div className="stat">
              <div className="label">Hidden</div>
              <div className="value">{summary.hidden}</div>
              <div className="foot">Removed by the store</div>
            </div>
          </div>

          <Card title="Rating breakdown" icon="star">
            <div className="bar-list compact">
              {[5, 4, 3, 2, 1].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`bar-row ${filters.stars === String(n) ? 'selected' : ''}`}
                  onClick={() => setFilter({ stars: filters.stars === String(n) ? '' : String(n) })}
                  aria-pressed={filters.stars === String(n)}
                >
                  <div className="top">
                    <span className="name">{n} star{n === 1 ? '' : 's'}</span>
                    <span className="amount">{summary.distribution[n]}</span>
                  </div>
                  <div className="track">
                    {summary.distribution[n] > 0 && <i style={{ width: `${(summary.distribution[n] / biggest) * 100}%` }} />}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="stars">Stars</label>
          <select id="stars" value={filters.stars} onChange={(e) => setFilter({ stars: e.target.value })}>
            <option value="">All</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Product, customer or words in the review"
          />
        </div>
      </div>

      {filters.product && (
        <div className="alert info row">
          <span>Showing reviews of one product{productName ? <> — <strong>{productName}</strong></> : null}.</span>
          <button type="button" className="btn ghost sm" onClick={() => setFilter({ product: '' })}>Show all products</button>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {loading && !data ? (
        <Loader />
      ) : !data || data.reviews.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={summary?.count || summary?.hidden ? 'No reviews match those filters' : 'No reviews yet'}
            message={summary?.count || summary?.hidden ? 'Try another star rating or search.' : 'Customers can rate a product once an order with it has been delivered.'}
          />
        </div>
      ) : (
        <>
          <div className={`review-list ${loading ? 'is-loading' : ''}`}>
            {data.reviews.map((review) => (
              <article key={review.id} className={`review-row ${review.isHidden ? 'hidden' : ''}`}>
                <div className="review-product">
                  {review.product?.image ? <img src={review.product.image} alt="" /> : <span className="thumb-empty" />}
                  <div>
                    {review.product ? (
                      <Link className="link" to={`/products/${review.product.id}`}>{review.product.name}</Link>
                    ) : (
                      <span className="muted">Deleted product</span>
                    )}
                    <div className="small muted">
                      {review.customer ? (
                        <>by <Link className="link" to={`/users/${review.customer.id}`}>{review.customer.name}</Link></>
                      ) : (
                        'by a deleted account'
                      )}
                    </div>
                  </div>
                </div>
                <div className="review-content">
                  <div className="row">
                    <RatingStars value={review.rating} />
                    <span className="small muted">{formatDate(review.createdAt)}</span>
                    {review.isHidden && <span className="badge warn">Hidden</span>}
                  </div>
                  {review.comment ? <p>{review.comment}</p> : <p className="muted small">No comment, just a rating.</p>}
                </div>
                <div className="review-actions">
                  <button
                    type="button"
                    className={`btn sm ${review.isHidden ? 'secondary' : 'quiet-danger'}`}
                    onClick={() => toggleHidden(review)}
                    disabled={busyId === review.id}
                  >
                    {review.isHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={(page) => setFilter({ page })} />
        </>
      )}
    </>
  );
}
