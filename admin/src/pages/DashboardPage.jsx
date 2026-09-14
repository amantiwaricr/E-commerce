import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import api from '../api/client';
import Loader from '../components/Loader';
import Card from '../components/Card';
import Delta from '../components/Delta';
import Icon from '../components/Icon';
import PillSelect from '../components/PillSelect';
import GaugeChart from '../components/charts/GaugeChart';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import Heatmap from '../components/charts/Heatmap';
import { useToast } from '../context/ToastContext';
import { formatNpr, formatCompact, timeAgo, titleCase } from '../utils/format';

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN = { daily: 'today', weekly: 'this week', monthly: 'this month', yearly: 'this year' };
const CHANNEL_COLOURS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

const Thumb = ({ src, alt }) =>
  src ? <img className="thumb" src={src} alt="" /> : <span className="thumb" aria-label={alt}>—</span>;

export default function DashboardPage() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [restocking, setRestocking] = useState('');

  useEffect(() => {
    api
      .get('/admin/stats')
      .then(({ data }) => setStats(data.stats))
      .catch((err) => setError(err.message));
  }, []);

  const loadAnalytics = useCallback(() => {
    api
      .get('/admin/analytics', { params: { period, year } })
      .then(({ data }) => setAnalytics(data.analytics))
      .catch((err) => setError(err.message));
  }, [period, year]);

  useEffect(loadAnalytics, [loadAnalytics]);

  const restock = async (product, quantity) => {
    setRestocking(product.id);
    try {
      await api.patch(`/admin/products/${product.id}/stock`, { delta: quantity });
      toast.success(`${product.name} restocked by ${quantity} ${product.unit}`);
      loadAnalytics();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestocking('');
    }
  };

  if (error) return <div className="alert error">{error}</div>;
  if (!stats || !analytics) return <Loader label="Building your dashboard…" />;

  const { channels, sales, topProducts, heatmap, customers, activity, lowStock } = analytics;
  const noun = PERIOD_NOUN[period] || 'this period';
  const yearOptions = Array.from(new Set([...(sales.years || []), year, new Date().getFullYear()]))
    .sort((a, b) => b - a)
    .map((value) => ({ value, label: String(value) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Store performance {noun}, compared with the period before it.</div>
        </div>
        <div className="row">
          <PillSelect label="Reporting period" value={period} onChange={setPeriod} options={PERIODS} />
          <Link className="btn secondary" to="/orders?status=pending">
            <Icon name="clock" size={15} /> Pending orders
          </Link>
          <Link className="btn" to="/products/new">
            <Icon name="plus" size={15} /> Add product
          </Link>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="stat accent">
          <div className="label"><Icon name="receipt" size={13} /> Today’s orders</div>
          <div className="value">{stats.todayOrders}</div>
          <div className="foot">{stats.pendingOrders} awaiting fulfilment</div>
        </div>
        <div className="stat accent">
          <div className="label"><Icon name="chart" size={13} /> Today’s revenue</div>
          <div className="value">{formatNpr(stats.todayRevenue)}</div>
          <div className="foot">{formatNpr(stats.lifetimeRevenue)} lifetime</div>
        </div>
        <div className="stat">
          <div className="label"><Icon name="users" size={13} /> New customers</div>
          <div className="value">{customers.total}</div>
          <div className="foot"><Delta value={customers.change} /> vs previous period</div>
        </div>
        <div className="stat">
          <div className="label"><Icon name="alert" size={13} /> Low stock</div>
          <div className="value">{stats.lowStockProducts}</div>
          <div className="foot">products at or below 5 units</div>
        </div>
      </div>

      <div className="dash">
        <div className="dash-col">
        {/* ── Channel performance ─────────────────────────────────────── */}
        <Card title="Channel performance" icon="gauge" to="/orders" toLabel="View orders">
          <GaugeChart
            label="items sold"
            value={channels.totalUnits.toLocaleString('en-IN')}
            groups={channels.channels.map((channel, index) => ({
              value: channel.revenue,
              colour: CHANNEL_COLOURS[index] || 'var(--chart-empty)',
            }))}
          />

          <div className="legend">
            {channels.channels.map((channel, index) => (
              <div className="legend-row" key={channel.key}>
                <div className="top">
                  <span className="name">
                    <i className="swatch" style={{ background: CHANNEL_COLOURS[index] || 'var(--chart-empty)' }} />
                    <span>{channel.label}</span>
                  </span>
                  <span className="amount">{formatNpr(channel.revenue)}</span>
                </div>
                <span className="meta">
                  {channel.orders} order{channel.orders === 1 ? '' : 's'} · {channel.share}% of sales
                  <Delta value={channel.change} />
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Recent activity ─────────────────────────────────────────── */}
        <Card title="Recent activity" icon="activity" to="/orders" toLabel="View orders">
          <div className="feed">
            <div className="feed-label">Outgoing — orders placed</div>
            {activity.outgoing.length === 0 && <p className="muted small">No orders yet.</p>}
            {activity.outgoing.map((entry) => (
              <Link className="feed-row" key={entry.orderNumber} to={`/orders/${entry.orderNumber}`}>
                <Thumb src={entry.item?.image} alt={entry.item?.name || entry.orderNumber} />
                <span className="body">
                  <span className="name">
                    {entry.item?.name || entry.orderNumber}
                    {entry.item?.quantity ? ` ×${entry.item.quantity}` : ''}
                    {entry.extraItems > 0 && <span className="muted"> +{entry.extraItems}</span>}
                  </span>
                  <span className="meta">
                    <span className="badge">{titleCase(entry.status)}</span>
                    <span className="ago">{timeAgo(entry.at, true)}</span>
                    <span className="amount">{formatNpr(entry.amount)}</span>
                  </span>
                </span>
              </Link>
            ))}

            <div className="feed-label">Incoming — stock on hand</div>
            {activity.incoming.length === 0 && <p className="muted small">Nothing in stock.</p>}
            {activity.incoming.map((entry) => (
              <Link className="feed-row" key={entry.id} to={`/products/${entry.id}`}>
                <Thumb src={entry.image} alt={entry.name} />
                <span className="body">
                  <span className="name">{entry.name}</span>
                  <span className="meta">
                    <span className="badge">{entry.stock} {entry.unit}</span>
                    <span className="ago">{timeAgo(entry.at, true)}</span>
                    <span className="amount">{formatNpr(entry.price)}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
        </div>

        <div className="dash-col">
        {/* ── Average sales ───────────────────────────────────────────── */}
        <Card
          title="Revenue by month"
          icon="chart"
          to="/orders"
          toLabel="View orders"
          tools={<PillSelect label="Year" value={year} onChange={(value) => setYear(Number(value))} options={yearOptions} />}
        >
          <div className="figure" style={{ marginBottom: 6 }}>
            <span className="amount">{formatNpr(sales.total)}</span>
            <Delta value={sales.change} />
            <span className="muted small">turnover {noun}</span>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="chart-legend">
              <span><i style={{ background: 'var(--series)' }} /> Revenue</span>
              <span><i style={{ background: 'var(--series-soft)' }} /> Target</span>
            </div>
            <span className="muted small">{year} total: <strong>{formatNpr(sales.net)}</strong></span>
          </div>

          <LineChart
            points={sales.points.map((point) => ({ ...point, tooltipLabel: `${point.label} ${sales.year}` }))}
            series={[
              { key: 'revenue', label: 'Revenue', colour: 'var(--series)', area: true },
              { key: 'target', label: 'Target', colour: 'var(--series-soft)', dashed: true, width: 2 },
            ]}
            formatValue={formatNpr}
            formatTick={(value) => `Rs ${formatCompact(value)}`}
          />
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Target is the trailing three-month average plus a 10% growth goal.
          </p>
        </Card>

        {/* ── Top products ────────────────────────────────────────────── */}
        <Card
          title="Top products"
          icon="box"
          to="/products"
          toLabel="View products"
          tools={<PillSelect label="Period" value={period} onChange={setPeriod} options={PERIODS} />}
        >
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="muted small">Units sold {noun}</span>
            <strong>{topProducts.totalUnits.toLocaleString('en-IN')} units</strong>
          </div>

          <BarChart
            bars={topProducts.products.map((product) => ({ label: product.name, value: product.units }))}
            formatTick={(value) => formatCompact(value)}
            emptyLabel={`No products sold ${noun}.`}
          />

          {topProducts.products.length > 0 && (
            <div className="legend" style={{ marginTop: 14 }}>
              {topProducts.products.map((product) => (
                <div className="legend-row" key={product.slug}>
                  <div className="top">
                    <span className="name"><span>{product.name}</span></span>
                    <span className="amount">{formatNpr(product.revenue)}</span>
                  </div>
                  <span className="meta" style={{ paddingLeft: 0 }}>
                    {product.units} {product.unit} across {product.orders} order{product.orders === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        </div>

        <div className="dash-col">
        {/* ── Order rush hours ────────────────────────────────────────── */}
        <Card title="When orders arrive" icon="eye" to="/orders" toLabel="View orders">
          <div className="figure">
            <span className="amount">{channels.totalOrders.toLocaleString('en-IN')}</span>
            <Delta value={channels.ordersChange ?? 0} />
            <span className="muted small">orders {noun}</span>
          </div>

          <div className="legend" style={{ marginTop: 14 }}>
            {channels.channels.map((channel) => (
              <div className="legend-row" key={channel.key}>
                <div className="top">
                  <span className="name" style={{ fontWeight: 500 }}><span>{channel.label}</span></span>
                  <span className="amount">{channel.orders}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="muted small" style={{ margin: '16px 0 0' }}>
            Busiest slot over the last {heatmap.windowDays} days:{' '}
            <strong>{heatmap.busiest ? `${heatmap.busiest.day}, ${heatmap.busiest.slot}` : 'not enough orders yet'}</strong>
          </p>
          <Heatmap days={heatmap.days} slots={heatmap.slots} peak={heatmap.peak} />
        </Card>

        {/* ── Needs restocking ───────────────────────────────────────── */}
        <Card title="Needs restocking" icon="alert" to="/products" toLabel="View products">
          {lowStock.length === 0 ? (
            <p className="muted small">Every available product is comfortably in stock.</p>
          ) : (
            lowStock.map((product) => (
              <div className="restock-row" key={product.id}>
                <Link className="name" to={`/products/${product.id}`}>{product.name}</Link>
                <span className="acts">
                  {[5, 10].map((quantity) => (
                    <button
                      key={quantity}
                      type="button"
                      className="btn secondary sm"
                      disabled={restocking === product.id}
                      onClick={() => restock(product, quantity)}
                    >
                      +{quantity}
                    </button>
                  ))}
                </span>
                <span className="meta">
                  <span className={`badge ${product.stock === 0 ? 'danger' : 'warn'}`}>
                    {product.stock} {product.unit} left
                  </span>
                  {formatNpr(product.price)}
                </span>
              </div>
            ))
          )}
        </Card>
        </div>
      </div>
    </>
  );
}
