import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatNpr } from '../utils/format';
import { PAYMENT_METHOD_LABELS } from '../config';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get('/orders', { params: { page, limit: 10 } })
      .then(({ data }) => {
        setOrders(data.orders);
        setPagination(data.pagination);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <Loader label="Loading your orders…" />;

  return (
    <div className="container page">
      <div className="page-head">
        <h1>My orders</h1>
      </div>

      {error && <div className="alert error">{error}</div>}

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          message="Once you place an order it will appear here with live tracking."
          actionLabel="Start shopping"
          actionTo="/products"
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Items</th>
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
                    </td>
                    <td className="small muted">{formatDate(order.createdAt)}</td>
                    <td>{order.items.length}</td>
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
                        Track
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
