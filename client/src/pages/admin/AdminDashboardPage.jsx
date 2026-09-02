import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Loader from '../../components/Loader';
import { formatNpr, titleCase } from '../../utils/format';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/stats')
      .then(({ data }) => setStats(data.stats))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <Loader label="Loading dashboard…" />;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Today’s orders</div>
          <div className="value">{stats.todayOrders}</div>
        </div>
        <div className="stat">
          <div className="label">Today’s revenue</div>
          <div className="value">{formatNpr(stats.todayRevenue)}</div>
        </div>
        <div className="stat">
          <div className="label">Pending fulfilment</div>
          <div className="value">{stats.pendingOrders}</div>
        </div>
        <div className="stat">
          <div className="label">Lifetime revenue</div>
          <div className="value">{formatNpr(stats.lifetimeRevenue)}</div>
        </div>
        <div className="stat">
          <div className="label">Total orders</div>
          <div className="value">{stats.totalOrders}</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{stats.customers}</div>
        </div>
        <div className="stat">
          <div className="label">Low stock products</div>
          <div className="value">{stats.lowStockProducts}</div>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 22 }}>
        <h3>Orders by status</h3>
        <div className="chip-row">
          {Object.entries(stats.ordersByStatus || {}).map(([status, count]) => (
            <Link key={status} className="chip" to={`/admin/orders?status=${status}`}>
              {titleCase(status)}: <strong>{count}</strong>
            </Link>
          ))}
          {Object.keys(stats.ordersByStatus || {}).length === 0 && <span className="muted small">No orders yet.</span>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Quick actions</h3>
        <div className="row">
          <Link className="btn" to="/admin/products/new">
            Add a product
          </Link>
          <Link className="btn secondary" to="/admin/orders?status=pending">
            Review pending orders
          </Link>
        </div>
      </section>
    </>
  );
}
