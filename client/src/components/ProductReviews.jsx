import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import Stars from './Stars';
import StarPicker, { RATING_WORDS } from './StarPicker';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDay } from '../utils/format';

const COMMENT_MAX = 1000;
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];

/** The signed-in customer's own rating: prompt, form, or what they said. */
function YourRating({ slug, onSaved }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [state, setState] = useState(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setState(null);
      return;
    }
    api
      .get(`/products/${slug}/reviews/mine`)
      .then(({ data }) => setState(data))
      .catch(() => setState({ eligible: false, reason: 'error', review: null }));
  }, [slug, isAuthenticated]);

  const startEditing = () => {
    setRating(state.review?.rating || 0);
    setComment(state.review?.comment || '');
    setError('');
    setEditing(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!rating) {
      setError('Choose how many stars first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/products/${slug}/reviews/mine`, { rating, comment });
      setState((s) => ({ ...s, review: data.review }));
      setEditing(false);
      toast.success(data.created ? 'Thanks — your rating is live.' : 'Your rating has been updated.');
      onSaved(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove your rating of this product?')) return;
    setBusy(true);
    try {
      const { data } = await api.delete(`/products/${slug}/reviews/mine`);
      setState((s) => ({ ...s, review: null }));
      toast.success('Your rating has been removed.');
      onSaved(data.summary);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="your-rating prompt">
        <div>
          <strong>Bought this before?</strong>
          <p className="muted small">Sign in to rate it. Ratings come only from customers who received it.</p>
        </div>
        <Link
          className="btn secondary sm"
          to="/login"
          state={{ from: { pathname: `${location.pathname}#reviews` } }}
        >
          Sign in to rate
        </Link>
      </div>
    );
  }

  if (!state) return <div className="your-rating prompt"><span className="muted small">Checking…</span></div>;

  if (editing || (state.eligible && !state.review)) {
    return (
      <form className="your-rating form" onSubmit={save} noValidate>
        <strong>{state.review ? 'Edit your rating' : 'Rate this product'}</strong>
        <StarPicker value={rating} onChange={setRating} disabled={busy} />
        <div className="field">
          <label htmlFor="review-comment">
            Tell other customers about it <span className="muted">(optional)</span>
          </label>
          <textarea
            id="review-comment"
            rows={3}
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Freshness, the cut, how it cooked…"
            disabled={busy}
          />
          <span className="small muted counter">{comment.length} / {COMMENT_MAX}</span>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="row">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : state.review ? 'Save changes' : 'Submit rating'}
          </button>
          {state.review && (
            <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  if (state.review) {
    return (
      <div className="your-rating mine">
        <div className="your-rating-head">
          <strong>Your rating</strong>
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={startEditing} disabled={busy}>Edit</button>
            <button type="button" className="btn ghost sm" onClick={remove} disabled={busy}>Remove</button>
          </div>
        </div>
        <div className="row">
          <Stars value={state.review.rating} size={18} />
          <span className="small">{RATING_WORDS[state.review.rating]}</span>
        </div>
        {state.review.comment && <p className="review-text">{state.review.comment}</p>}
        {state.review.isHidden && (
          <p className="small muted">The store has hidden this review, so other customers don’t see it.</p>
        )}
      </div>
    );
  }

  return (
    <div className="your-rating prompt">
      <div>
        <strong>{state.reason === 'admin' ? 'Store accounts can’t rate products' : 'Rate it after it arrives'}</strong>
        <p className="muted small">
          {state.reason === 'admin'
            ? 'Ratings come from customers only.'
            : 'You can rate this once an order with it has been delivered to you.'}
        </p>
      </div>
      {state.reason === 'not-delivered' && <Link className="btn secondary sm" to="/orders">My orders</Link>}
    </div>
  );
}

/**
 * Ratings and reviews for one product: the summary, the customer's own
 * rating, and the reviews other customers left.
 */
export default function ProductReviews({ slug, onSummary }) {
  const location = useLocation();
  const sectionRef = useRef(null);
  const [summary, setSummary] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [sort, setSort] = useState('newest');
  const [stars, setStars] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrolled = useRef(false);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: 6, sort, ...(stars ? { stars } : {}) };
        const { data } = await api.get(`/products/${slug}/reviews`, { params });
        setSummary(data.summary);
        setReviews((list) => (page === 1 ? data.reviews : [...list, ...data.reviews]));
        setPagination(data.pagination);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [slug, sort, stars]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  // A "/products/x#reviews" link lands here once the section has content.
  useEffect(() => {
    if (location.hash === '#reviews' && summary && !scrolled.current) {
      scrolled.current = true;
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, summary]);

  const saved = (next) => {
    if (next) onSummary?.(next);
    load(1);
  };

  const count = summary?.count || 0;
  const biggest = Math.max(1, ...Object.values(summary?.distribution || {}));

  return (
    <section className="panel reviews" id="reviews" ref={sectionRef} aria-labelledby="reviews-title">
      <div className="reviews-head">
        <h2 id="reviews-title">Ratings &amp; reviews</h2>
        {count > 0 && <span className="muted small">{count} rating{count === 1 ? '' : 's'} from verified buyers</span>}
      </div>

      <div className={`reviews-grid ${count === 0 && !loading ? 'solo' : ''}`}>
        <div className="reviews-summary">
          {count > 0 ? (
            <>
              <div className="reviews-score">
                <strong>{summary.average.toFixed(1)}</strong>
                <div>
                  <Stars value={summary.average} size={18} />
                  <span className="muted small">out of 5</span>
                </div>
              </div>
              <div className="reviews-bars" role="group" aria-label="Filter by stars">
                {[5, 4, 3, 2, 1].map((n) => {
                  const rows = summary.distribution[n] || 0;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`reviews-bar ${stars === n ? 'active' : ''}`}
                      onClick={() => setStars((s) => (s === n ? 0 : n))}
                      aria-pressed={stars === n}
                      disabled={!rows && stars !== n}
                      aria-label={`${n} star: ${rows} rating${rows === 1 ? '' : 's'}${stars === n ? ', filtered' : ''}`}
                    >
                      <span className="n">{n}★</span>
                      <span className="track"><i style={{ width: `${(rows / biggest) * 100}%` }} /></span>
                      <span className="c">{rows}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            !loading && (
              <div className="reviews-empty">
                <Stars value={0} size={20} />
                <p><strong>No ratings yet</strong></p>
                <p className="muted small">Customers who have received this can be the first to rate it.</p>
              </div>
            )
          )}
          <YourRating slug={slug} onSaved={saved} />
        </div>

        <div className="reviews-list">
          {count > 0 && (
            <div className="reviews-tools">
              <span className="small muted">
                {stars ? `Showing ${stars}-star ratings` : `Showing ${pagination.total} of ${count}`}
                {stars > 0 && (
                  <button type="button" className="link-more" onClick={() => setStars(0)}>Show all</button>
                )}
              </span>
              <label className="small">
                <span className="sr-only">Sort reviews</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
          )}

          {error && <div className="alert error">{error}</div>}

          <ul className="review-items">
            {reviews.map((review) => (
              <li key={review.id} className="review-item">
                <span className="review-avatar" aria-hidden="true">{review.author.charAt(0).toUpperCase()}</span>
                <div className="review-body">
                  <div className="review-meta">
                    <strong>{review.author}</strong>
                    <span className="badge ok">Verified buyer</span>
                    <span className="muted small">
                      {formatDay(review.createdAt)}
                      {review.edited && ' · edited'}
                    </span>
                  </div>
                  <Stars value={review.rating} size={14} />
                  {review.comment ? (
                    <p className="review-text">{review.comment}</p>
                  ) : (
                    <p className="muted small">Rated {RATING_WORDS[review.rating].toLowerCase()}, no comment.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {pagination.page < pagination.pages && (
            <button type="button" className="btn secondary block" onClick={() => load(pagination.page + 1)} disabled={loading}>
              {loading ? 'Loading…' : 'Show more reviews'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
