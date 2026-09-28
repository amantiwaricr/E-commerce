import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { formatDate, formatDay, formatNpr, timeAgo } from '../utils/format';
import { PAYMENT_METHOD_LABELS } from '../config';

const STOCK_LABELS = { ok: 'In stock', low: 'Low stock', out: 'Sold out', hidden: 'Hidden' };
const STOCK_TONES = { ok: 'ok', low: 'warn', out: 'danger', hidden: '' };

export default function CustomerDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: body } = await api.get(`/admin/users/${id}`);
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async () => {
    const { customer } = data;
    if (!customer.isBlocked && !window.confirm(`Block ${customer.name}? They will be signed out and unable to order.`)) return;
    setBusy(true);
    try {
      await api.patch(`/admin/users/${customer.id}/block`, { isBlocked: !customer.isBlocked });
      toast.success(`${customer.name} ${customer.isBlocked ? 'unblocked' : 'blocked'}.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;
  if (error || !data) {
    return <EmptyState title="Customer not found" message={error} actionLabel="Back to customers" actionTo="/users" />;
  }

  const { customer, summary, recentOrders, usuallyBuys, favourites } = data;
  const initial = (customer.name || customer.email || '?').trim().charAt(0).toUpperCase();
  const topUnits = Math.max(1, ...usuallyBuys.map((row) => row.units));
  const kept = summary.orders - summary.cancelled;

  return (
    <>
      <p className="small muted">
        <Link to="/users">← All customers</Link>
      </p>

      <div className="page-head">
        <div className="profile-head">
          {customer.avatar ? <img className="avatar lg" src={customer.avatar} alt="" /> : <span className="avatar lg">{initial}</span>}
          <div>
            <h1>{customer.name}</h1>
            <div className="row">
              <span className={`badge ${customer.role === 'admin' ? 'gold' : ''}`}>{customer.role}</span>
              <span className={`badge ${customer.isBlocked ? 'danger' : 'ok'}`}>{customer.isBlocked ? 'Blocked' : 'Active'}</span>
              {!customer.isEmailVerified && <span className="badge warn">Email not verified</span>}
              <span className="small muted">Customer since {formatDay(customer.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="row">
          <a className="btn secondary" href={`mailto:${customer.email}`}>
            <Icon name="mail" size={15} /> Email
          </a>
          {customer.role !== 'admin' && (
            <button
              type="button"
              className={`btn ${customer.isBlocked ? 'secondary' : 'quiet-danger'}`}
              onClick={toggleBlock}
              disabled={busy}
            >
              {customer.isBlocked ? 'Unblock customer' : 'Block customer'}
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="label">Lifetime spend</div>
          <div className="value">{formatNpr(summary.spent)}</div>
          <div className="foot">Excludes cancelled orders</div>
        </div>
        <div className="stat">
          <div className="label">Orders</div>
          <div className="value">{summary.orders}</div>
          <div className="foot">
            {summary.delivered} delivered{summary.cancelled > 0 && <> · {summary.cancelled} cancelled</>}
          </div>
        </div>
        <div className="stat">
          <div className="label">Average order</div>
          <div className="value">{formatNpr(summary.averageOrder)}</div>
          <div className="foot">Across {kept} order{kept === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="label">Last order</div>
          <div className="value">{summary.lastOrderAt ? timeAgo(summary.lastOrderAt) : '—'}</div>
          <div className="foot">{summary.firstOrderAt ? `First ordered ${formatDay(summary.firstOrderAt)}` : 'Has not ordered yet'}</div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <Card title="Recent orders" icon="receipt" to={summary.orders > recentOrders.length ? `/orders?user=${customer.id}` : undefined} toLabel="All of their orders">
            {recentOrders.length === 0 ? (
              <p className="muted small">No orders yet.</p>
            ) : (
              <div className="table-wrap flush">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Placed</th>
                      <th>Items</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.orderNumber}>
                        <td className="nowrap">
                          <Link className="link" to={`/orders/${order.orderNumber}`}>{order.orderNumber}</Link>
                        </td>
                        <td className="small muted nowrap">{formatDay(order.createdAt)}</td>
                        <td className="small wide-text">
                          {order.firstItem}
                          {order.items > 1 && <span className="muted"> +{order.items - 1} more</span>}
                        </td>
                        <td>
                          <div className="small">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</div>
                          <StatusBadge status={order.paymentStatus} kind="payment" />
                        </td>
                        <td><StatusBadge status={order.orderStatus} /></td>
                        <td className="num"><strong>{formatNpr(order.totalAmount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Usually buys" icon="chart">
            {usuallyBuys.length === 0 ? (
              <p className="muted small">Nothing yet — this appears once they have an order that was not cancelled.</p>
            ) : (
              <div className="bar-list">
                {usuallyBuys.map((row) => (
                  <div className="bar-row" key={row.name}>
                    <div className="top">
                      <span className="name">{row.name}</span>
                      <span className="amount">{formatNpr(row.spent)}</span>
                    </div>
                    <div className="track"><i style={{ width: `${(row.units / topUnits) * 100}%` }} /></div>
                    <div className="meta">
                      {row.units} unit{row.units === 1 ? '' : 's'} across {row.orders} order{row.orders === 1 ? '' : 's'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Contact" icon="users">
            <dl className="facts">
              <div>
                <dt><Icon name="mail" size={14} /> Email</dt>
                <dd><a className="link" href={`mailto:${customer.email}`}>{customer.email}</a></dd>
              </div>
              <div>
                <dt><Icon name="phone" size={14} /> Phone</dt>
                <dd>{customer.phone ? <a className="link" href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</dd>
              </div>
              <div>
                <dt><Icon name="clock" size={14} /> Last sign-in</dt>
                <dd>{customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}</dd>
              </div>
            </dl>
          </Card>

          <Card title={`Addresses (${customer.addresses.length})`} icon="pin">
            {customer.addresses.length === 0 ? (
              <p className="muted small">No saved addresses.</p>
            ) : (
              <ul className="address-list">
                {customer.addresses.map((address, index) => (
                  <li key={address._id || index}>
                    <strong>{address.label || `Address ${index + 1}`}</strong>
                    {index === 0 && customer.addresses.length > 1 && <span className="badge info">Most recent</span>}
                    {address.recipientName && <div className="small">{address.recipientName}</div>}
                    <div className="small muted">
                      {[address.street, address.landmark, address.city, address.district].filter(Boolean).join(', ')}
                    </div>
                    {address.phone && <div className="small muted">{address.phone}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Favourites (${favourites.length})`} icon="heart">
            {favourites.length === 0 ? (
              <p className="muted small">Has not saved any products.</p>
            ) : (
              <div className="feed">
                {favourites.map((product) => (
                  <Link className="feed-row" key={product.id} to={`/products/${product.id}`}>
                    {product.image ? <img className="thumb" src={product.image} alt="" /> : <span className="thumb">—</span>}
                    <div className="body">
                      <span className="name">{product.name}</span>
                      <span className="meta">
                        {formatNpr(product.price)} / {product.unit}
                        <span className={`badge ${STOCK_TONES[product.status]}`}>{STOCK_LABELS[product.status]}</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
