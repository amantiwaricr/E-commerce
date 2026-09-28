import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import Card from '../components/Card';
import Icon from '../components/Icon';
import { formatNpr, timeAgo } from '../utils/format';

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs restock' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Sold out' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'ok', label: 'Healthy' },
];
const STATUS_LABELS = { ok: 'Healthy', low: 'Low', out: 'Sold out', hidden: 'Hidden' };
const STATUS_TONES = { ok: 'ok', low: 'warn', out: 'danger', hidden: '' };

/** Two weeks of cover fills the meter; under a week is urgent. */
const COVER_FULL_DAYS = 14;
const coverTone = (days) => (days < 3 ? 'danger' : days < 7 ? 'warn' : 'ok');

function Cover({ row }) {
  if (row.status === 'out') return <span className="small danger-text">Sold out</span>;
  if (row.daysOfCover == null) return <span className="small muted">No recent sales</span>;
  const days = row.daysOfCover;
  const whole = Math.round(days);
  return (
    <div className={`cover ${coverTone(days)}`} title={`${whole} days at the last ${row.velocityDays}-day selling rate`}>
      <div className="track"><i style={{ width: `${Math.min(1, days / COVER_FULL_DAYS) * 100}%` }} /></div>
      <span>{days >= 365 ? '1 yr+' : days < 1 ? '< 1 day' : `${whole} day${whole === 1 ? '' : 's'}`}</span>
    </div>
  );
}

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get('status')) ? params.get('status') : 'all';
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = Object.fromEntries(Object.entries({ status: view, category, search }).filter(([, v]) => v && v !== 'all'));
      const { data: body } = await api.get('/admin/inventory', { params: query });
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view, category, search]);

  useEffect(() => {
    // Typing in the search box waits for a pause rather than firing per key.
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const setView = (key) => {
    const next = new URLSearchParams(params);
    if (key === 'all') next.delete('status');
    else next.set('status', key);
    setParams(next);
  };

  const summary = data?.summary;
  const counts = summary
    ? { all: summary.skus, attention: summary.low + summary.out, low: summary.low, out: summary.out, hidden: summary.hidden, ok: summary.ok }
    : {};
  const topValue = Math.max(1, ...(summary?.byCategory || []).map((c) => c.value));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <div className="sub">
            Stock on hand, how fast it is selling and how long it will last
            {data ? ` — based on the last ${data.velocityDays} days of orders.` : '.'}
          </div>
        </div>
        <Link className="btn" to="/products/new">
          <Icon name="plus" size={15} /> Add product
        </Link>
      </div>

      {summary && (
        <div className="inv-top">
          <div className="stat-grid">
            <div className="stat accent">
              <div className="label">Stock value</div>
              <div className="value">{formatNpr(summary.stockValue)}</div>
              <div className="foot">At current selling prices</div>
            </div>
            <div className="stat">
              <div className="label">Units on the shelf</div>
              <div className="value">{summary.unitsInStock.toLocaleString('en-IN')}</div>
              <div className="foot">Across {summary.skus - summary.hidden} listed products</div>
            </div>
            <div className="stat">
              <div className="label">Needs restock</div>
              <div className="value">{summary.low + summary.out}</div>
              <div className="foot">
                <span className="badge danger">{summary.out} sold out</span>
                <span className="badge warn">{summary.low} low</span>
              </div>
            </div>
            <div className="stat">
              <div className="label">Hidden</div>
              <div className="value">{summary.hidden}</div>
              <div className="foot">Not visible on the storefront</div>
            </div>
          </div>

          <Card title="Value by category" icon="layers">
            {summary.byCategory.length === 0 ? (
              <p className="muted small">No products yet.</p>
            ) : (
              <div className="bar-list compact">
                {summary.byCategory.map((row) => (
                  <button
                    type="button"
                    className={`bar-row ${category === row.name ? 'selected' : ''}`}
                    key={row.name}
                    onClick={() => setCategory((c) => (c === row.name ? '' : row.name))}
                    aria-pressed={category === row.name}
                  >
                    <div className="top">
                      <span className="name">{row.name}</span>
                      <span className="amount">{formatNpr(row.value)}</span>
                    </div>
                    <div className="track"><i style={{ width: `${(row.value / topValue) * 100}%` }} /></div>
                    <div className="meta">{row.skus} product{row.skus === 1 ? '' : 's'} · {row.units} unit{row.units === 1 ? '' : 's'}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Stock status">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? 'active' : ''}
              onClick={() => setView(v.key)}
            >
              {v.label}
              {counts[v.key] != null && <span className="count">{counts[v.key]}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-fields">
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="pill-input">
            <option value="">All categories</option>
            {(data?.categories || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="pill-input search-input">
            <Icon name="search" size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product" aria-label="Find a product" />
          </label>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading && !data ? (
        <Loader />
      ) : !data || data.products.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={view === 'attention' ? 'Nothing needs restocking' : 'No products match'}
            message={view === 'attention' ? 'Every listed product has more than five units on the shelf.' : 'Try another tab, category or search.'}
          />
        </div>
      ) : (
        <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th className="num">In stock</th>
                <th className="num">Sold ({data.velocityDays}d)</th>
                <th>Will last</th>
                <th className="num">Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.products.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="cell-product">
                      {row.image ? <img src={row.image} alt="" /> : <span className="thumb-empty" />}
                      <div>
                        <strong>{row.name}</strong>
                        <div className="small muted">{row.category} · {formatNpr(row.price)} / {row.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${STATUS_TONES[row.status]}`}>{STATUS_LABELS[row.status]}</span></td>
                  <td className="num">
                    <strong>{row.stock}</strong> <span className="small muted">{row.unit}</span>
                  </td>
                  <td className="num">{row.soldRecently || <span className="muted">—</span>}</td>
                  <td><Cover row={{ ...row, velocityDays: data.velocityDays }} /></td>
                  <td className="num">{formatNpr(row.stockValue)}</td>
                  <td>
                    <Link className="btn secondary sm" to={`/products/${row.id}`} title={`Last updated ${timeAgo(row.updatedAt)}`}>
                      {row.status === 'low' || row.status === 'out' ? 'Restock' : 'Edit'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
