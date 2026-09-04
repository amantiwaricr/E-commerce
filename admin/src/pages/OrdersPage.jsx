import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatNpr } from '../utils/format';
import { ORDER_STATUSES, PAYMENT_METHOD_LABELS } from '../config';

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = {
    page: Number(searchParams.get('page')) || 1,
    status: searchParams.get('status') || '',
    paymentMethod: searchParams.get('paymentMethod') || '',
    paymentStatus: searchParams.get('paymentStatus') || '',
    orderNumber: searchParams.get('orderNumber') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };

  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, value);
    });
    if (!('page' in patch)) next.delete('page');
    setSearchParams(next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(
        Object.entries({ ...filters, limit: 20 }).filter(([, value]) => value !== '' && value != null)
      );
      const { data } = await api.get('/admin/orders', { params });
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // The URL is the single source of truth for the filter set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <h1>Orders</h1>
        <span className="muted small">{pagination.total ?? 0} matching orders</span>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="paymentMethod">Payment method</label>
          <select
            id="paymentMethod"
            value={filters.paymentMethod}
            onChange={(e) => setFilter({ paymentMethod: e.target.value })}
          >
            <option value="">All</option>
            <option value="esewa">eSewa</option>
            <option value="card">Card</option>
            <option value="cod">Cash on delivery</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="paymentStatus">Payment status</label>
          <select
            id="paymentStatus"
            value={filters.paymentStatus}
            onChange={(e) => setFilter({ paymentStatus: e.target.value })}
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="orderNumber">Order number</label>
          <input
            id="orderNumber"
            value={filters.orderNumber}
            onChange={(e) => setFilter({ orderNumber: e.target.value })}
            placeholder="FMN-2601-00001"
          />
        </div>
        <button type="button" className="btn secondary" onClick={() => setSearchParams(new URLSearchParams())}>
          Reset
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <Loader />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders match those filters" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <div className="small muted">{order.items.length} item(s)</div>
                    </td>
                    <td>
                      {order.user?.name || '—'}
                      <div className="small muted">{order.shippingAddress?.phone}</div>
                    </td>
                    <td className="small muted">{formatDate(order.createdAt)}</td>
                    <td>{formatNpr(order.totalAmount)}</td>
                    <td>
                      <div className="small">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
                      <StatusBadge status={order.paymentStatus} kind="payment" />
                    </td>
                    <td>
                      <StatusBadge status={order.orderStatus} />
                    </td>
                    <td>
                      <Link className="btn secondary sm" to={`/orders/${order.orderNumber}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} onChange={(page) => setFilter({ page })} />
        </>
      )}
    </>
  );
}
