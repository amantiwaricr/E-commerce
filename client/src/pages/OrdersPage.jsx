import { useEffect, useState } from 'react';
import api from '../api/client';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import OrderCard from '../components/OrderCard';
import { BoxIcon, TruckIcon, WalletIcon, ClockIcon } from '../components/icons';
import { formatNpr } from '../utils/format';
import useSeo from '../hooks/useSeo';
import { seoFor } from '../seo/pages';

/**
 * `active` is a grouping the API understands, not a stored status — an order on
 * its way is pending, confirmed, processing or shipped. Filtering happens in the
 * database so the tab counts and the pagination agree; narrowing the ten orders
 * on the current page would be a different, wrong answer.
 */
const TABS = [
  { key: '', label: 'All', count: (s) => s.total },
  { key: 'active', label: 'Active', count: (s) => s.active },
  { key: 'delivered', label: 'Delivered', count: (s) => s.delivered },
  { key: 'cancelled', label: 'Cancelled', count: (s) => s.cancelled },
];

const EMPTY_SUMMARY = { total: 0, active: 0, delivered: 0, cancelled: 0, spent: 0, byStatus: {} };

const EMPTY_COPY = {
  '': { title: 'No orders yet', message: 'Once you place an order it will appear here with live tracking.' },
  active: { title: 'Nothing on its way', message: 'Orders still being prepared or delivered show up here.' },
  delivered: { title: 'No deliveries yet', message: 'Completed orders collect here, each with its bill to download.' },
  cancelled: { title: 'No cancelled orders', message: 'Nothing here — which is the way it should be.' },
};

const OrderSkeleton = () => (
  <div className="ocard ocard-skeleton" aria-hidden="true">
    <div className="skel" style={{ height: 18, width: '38%' }} />
    <div className="skel" style={{ height: 44, width: '72%' }} />
    <div className="skel" style={{ height: 12, width: '100%' }} />
    <div className="skel" style={{ height: 30, width: '56%' }} />
  </div>
);

export default function OrdersPage() {
  useSeo({ ...seoFor('/orders'), path: '/orders' });

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');

    api
      .get('/orders', { params: { page, limit: 10, ...(status ? { status } : {}) } })
      .then(({ data }) => {
        if (!live) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
        setPagination(data.pagination || { page: 1, pages: 1 });
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));

    // A slow request for the tab you just left must not overwrite the new one.
    return () => {
      live = false;
    };
  }, [page, status]);

  const choose = (key) => {
    setStatus(key);
    setPage(1);
  };

  const stats = [
    { icon: BoxIcon, label: 'Orders placed', value: summary.total },
    { icon: ClockIcon, label: 'On the way', value: summary.active },
    { icon: TruckIcon, label: 'Delivered', value: summary.delivered },
    { icon: WalletIcon, label: 'Total spent', value: formatNpr(summary.spent) },
  ];

  /* Only the very first load has nothing to show; later loads keep the tabs and
     stats on screen so the page does not collapse and rebuild under you. */
  const firstLoad = loading && !summary.total && !orders.length;
  const empty = EMPTY_COPY[status] || EMPTY_COPY[''];

  return (
    <div className="container page orders">
      <header className="orders-head">
        <div>
          <h1>My orders</h1>
          <p className="muted">Track every delivery, download a bill, or put an old order straight back in the cart.</p>
        </div>
      </header>

      <div className="orders-stats">
        {stats.map(({ icon: Icon, label, value }) => (
          <div className="ostat" key={label}>
            <span className="ostat-icon">
              <Icon width={17} height={17} />
            </span>
            <span className="ostat-body">
              <b>{firstLoad ? '—' : value}</b>
              <small>{label}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="orders-tabs" role="tablist" aria-label="Filter orders">
        {TABS.map((tab) => (
          <button
            key={tab.key || 'all'}
            type="button"
            role="tab"
            aria-selected={status === tab.key}
            className={`otab ${status === tab.key ? 'on' : ''}`}
            onClick={() => choose(tab.key)}
          >
            {tab.label}
            <span className="otab-count">{firstLoad ? '·' : tab.count(summary)}</span>
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div className="orders-list" aria-busy="true">
          <OrderSkeleton />
          <OrderSkeleton />
          <OrderSkeleton />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title={empty.title}
          message={empty.message}
          actionLabel={status ? 'See all orders' : 'Start shopping'}
          actionTo={status ? undefined : '/shop'}
          onAction={status ? () => choose('') : undefined}
        />
      ) : (
        <>
          <div className="orders-list">
            {orders.map((order) => (
              <OrderCard key={order._id} order={order} />
            ))}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
