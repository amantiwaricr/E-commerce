import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { formatDate, formatNpr } from '../utils/format';
import { PAYMENT_METHOD_LABELS } from '../config';

/** The same five outcomes the storefront's integrity badge shows. */
export const LEDGER = {
  verified: { label: 'Verified', tone: 'ok', hint: 'Every entry is signed and the chain is unbroken.' },
  unsigned: { label: 'Unsigned', tone: '', hint: 'The chain is intact, but it was written without a signing key.' },
  partial: { label: 'Partly signed', tone: 'warn', hint: 'The chain is intact; some entries predate the signing key.' },
  broken: { label: 'Does not verify', tone: 'danger', hint: 'A recorded entry no longer matches its hash or signature.' },
  none: { label: 'No record', tone: '', hint: 'This order predates the transaction ledger.' },
};

const OUTCOMES = [
  { key: 'collected', label: 'Collected', status: 'paid', foot: 'Paid orders' },
  { key: 'outstanding', label: 'Outstanding', status: 'unpaid', foot: 'Unpaid, not cancelled' },
  { key: 'failed', label: 'Failed', status: 'failed', foot: 'Payment attempts that failed' },
  { key: 'refunded', label: 'Refunded', status: 'refunded', foot: 'Returned to customers' },
];

const shortHash = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : '');

function LedgerAudit() {
  const toast = useToast();
  const [audit, setAudit] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const { data } = await api.get('/admin/ledger/audit');
      setAudit(data.audit);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const clean = audit && audit.counts.broken === 0;

  return (
    <Card
      title="Transaction integrity"
      icon="shield"
      className="audit-card"
      tools={(
        <button type="button" className="btn sm" onClick={run} disabled={running}>
          <Icon name="refresh" size={14} /> {running ? 'Checking…' : audit ? 'Run again' : 'Run audit'}
        </button>
      )}
    >
      {!audit ? (
        <p className="muted small">
          Every order carries a hash-chained ledger signed with the store’s Ed25519 key. An audit re-checks every
          entry of every order, so an amount or status edited directly in the database shows up here.
        </p>
      ) : (
        <>
          <div className={`audit-verdict ${clean ? 'ok' : 'danger'}`}>
            <Icon name={clean ? 'shield' : 'alert'} size={20} />
            <div>
              <strong>
                {clean
                  ? `All ${audit.checked.toLocaleString('en-IN')} orders check out`
                  : `${audit.counts.broken} of ${audit.checked.toLocaleString('en-IN')} orders fail verification`}
              </strong>
              <div className="small">
                Checked in {audit.durationMs} ms
                {audit.signingConfigured ? <> · key <code>{audit.keyId}</code></> : ' · no signing key configured'}
              </div>
            </div>
          </div>

          <div className="audit-counts">
            {/* Verified and failing always show; the rest only when they occur. */}
            {Object.entries(LEDGER).filter(([key]) => key === 'verified' || key === 'broken' || audit.counts[key] > 0).map(([key, meta]) => (
              <div key={key} title={meta.hint}>
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
                <strong>{audit.counts[key] || 0}</strong>
              </div>
            ))}
          </div>

          {audit.broken.length > 0 && (
            <div className="audit-broken">
              <div className="small muted">
                Orders to investigate{audit.counts.broken > audit.broken.length ? ` (first ${audit.broken.length})` : ''}:
              </div>
              <div className="chip-row">
                {audit.broken.map((orderNumber) => (
                  <Link key={orderNumber} className="chip danger" to={`/orders/${orderNumber}`}>{orderNumber}</Link>
                ))}
              </div>
            </div>
          )}
          {!audit.signingConfigured && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Run <code>npm run keys:txn</code> from the project root and restart the API to sign new transactions.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    page: Number(params.get('page')) || 1,
    method: params.get('method') || '',
    status: params.get('status') || '',
    search: params.get('search') || '',
  };
  const [draft, setDraft] = useState(filters.search);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const { data: body } = await api.get('/admin/payments', { params: query });
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

  // Commit the search box to the URL after a pause in typing.
  useEffect(() => {
    if (draft === filters.search) return undefined;
    const timer = setTimeout(() => setFilter({ search: draft.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const summary = data?.summary;
  const methods = Object.entries(summary?.byMethod || {}).sort((a, b) => b[1].amount - a[1].amount);
  const methodTotal = methods.reduce((sum, [, row]) => sum + row.amount, 0) || 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <div className="sub">Money in, money owed, and whether each transaction record still verifies.</div>
        </div>
      </div>

      {summary && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`stat stat-button ${o.key === 'collected' ? 'accent' : ''} ${filters.status === o.status ? 'selected' : ''}`}
              onClick={() => setFilter({ status: filters.status === o.status ? '' : o.status })}
              aria-pressed={filters.status === o.status}
            >
              <div className="label">{o.label}</div>
              <div className="value">{formatNpr(summary[o.key].amount)}</div>
              <div className="foot">
                {summary[o.key].count} order{summary[o.key].count === 1 ? '' : 's'} · {o.foot}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="pay-top">
        <Card title="Collected by method" icon="wallet">
          {methods.length === 0 ? (
            <p className="muted small">No payments collected yet.</p>
          ) : (
            <>
              <div className="split-bar" aria-hidden="true">
                {methods.map(([method, row], index) => (
                  <i key={method} className={`s${index}`} style={{ width: `${(row.amount / methodTotal) * 100}%` }} />
                ))}
              </div>
              <div className="legend">
                {methods.map(([method, row], index) => (
                  <div className="legend-row" key={method}>
                    <div className="top">
                      <span className="name">
                        <i className={`swatch s${index}`} />
                        <span>{PAYMENT_METHOD_LABELS[method] || method}</span>
                      </span>
                      <span className="amount">{formatNpr(row.amount)}</span>
                    </div>
                    <div className="meta">
                      {row.count} order{row.count === 1 ? '' : 's'} · {Math.round((row.amount / methodTotal) * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
        <LedgerAudit />
      </div>

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="method">Method</label>
          <select id="method" value={filters.method} onChange={(e) => setFilter({ method: e.target.value })}>
            <option value="">All</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Order number or eSewa reference"
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading && !data ? (
        <Loader />
      ) : !data || data.payments.length === 0 ? (
        <div className="panel"><EmptyState title="No payments match those filters" /></div>
      ) : (
        <>
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Record</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => {
                  const ledger = LEDGER[payment.ledger.verdict] || LEDGER.none;
                  return (
                    <tr key={payment.orderNumber} className={payment.ledger.verdict === 'broken' ? 'row-danger' : ''}>
                      <td className="nowrap">
                        <Link className="link" to={`/orders/${payment.orderNumber}`}><strong>{payment.orderNumber}</strong></Link>
                        {payment.reference && <div className="small muted mono">Ref {payment.reference}</div>}
                      </td>
                      <td>
                        {payment.customer ? (
                          <>
                            <Link className="link" to={`/users/${payment.customer.id}`}>{payment.customer.name}</Link>
                            <div className="small muted">{payment.customer.email}</div>
                          </>
                        ) : (
                          <span className="muted">Deleted account</span>
                        )}
                      </td>
                      <td className="small">{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</td>
                      <td className="num"><strong>{formatNpr(payment.amount)}</strong></td>
                      <td>
                        <StatusBadge status={payment.status} kind="payment" />
                        {payment.orderStatus === 'cancelled' && <div className="small muted">Order cancelled</div>}
                      </td>
                      <td>
                        <span className={`badge ${ledger.tone}`} title={ledger.hint}>{ledger.label}</span>
                        {payment.ledger.receipt && (
                          <div className="small muted mono" title={`Receipt hash ${payment.ledger.receipt}`}>
                            {payment.ledger.entries} entr{payment.ledger.entries === 1 ? 'y' : 'ies'} · {shortHash(payment.ledger.receipt)}
                          </div>
                        )}
                      </td>
                      <td className="small muted">
                        {formatDate(payment.paidAt || payment.createdAt)}
                        {payment.paidAt && <div>paid</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={(page) => setFilter({ page })} />
        </>
      )}
    </>
  );
}
