import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import OrderTimeline from '../components/OrderTimeline';
import { useToast } from '../context/ToastContext';
import { formatDate, formatNpr } from '../utils/format';
import { NEXT_STATUSES, PAYMENT_METHOD_LABELS } from '../config';


export default function OrderDetailPage() {
  const { orderNumber } = useParams();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [tracking, setTracking] = useState({ carrier: '', trackingCode: '', estimatedDelivery: '', note: '' });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/orders/${orderNumber}`);
      setOrder(data.order);
      setTracking({
        carrier: data.order.trackingInfo?.carrier || '',
        trackingCode: data.order.trackingInfo?.trackingCode || '',
        estimatedDelivery: data.order.trackingInfo?.estimatedDelivery || '',
        note: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (status) => {
    if (status === 'cancelled' && !window.confirm('Cancel this order and return the stock?')) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/orders/${orderNumber}/status`, { status, note: statusNote });
      setOrder(data.order);
      setStatusNote('');
      toast.success(`Order marked ${status}. The customer has been notified.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTracking = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/orders/${orderNumber}/tracking`, tracking);
      setOrder(data.order);
      setTracking((current) => ({ ...current, note: '' }));
      toast.success('Tracking details saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;
  if (error || !order) {
    return <EmptyState title="Order not found" message={error} actionLabel="Back to orders" actionTo="/orders" />;
  }

  const nextStatuses = NEXT_STATUSES[order.orderStatus] || [];

  return (
    <>
      <p className="small muted">
        <Link to="/orders">← All orders</Link>
      </p>

      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: 6 }}>{order.orderNumber}</h1>
          <div className="row">
            <StatusBadge status={order.orderStatus} />
            <StatusBadge status={order.paymentStatus} kind="payment" />
            <span className="small muted">{formatDate(order.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="checkout-grid">
        <div className="stack">
          <section className="panel">
            <h3>Advance this order</h3>
            {nextStatuses.length === 0 ? (
              <p className="muted small">
                This order is {order.orderStatus} — no further status changes are possible.
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="statusNote">Note for the customer (optional)</label>
                  <input
                    id="statusNote"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Butchering started, rider assigned…"
                  />
                </div>
                <div className="row">
                  {nextStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn ${status === 'cancelled' ? 'danger' : ''}`}
                      onClick={() => changeStatus(status)}
                      disabled={busy}
                    >
                      Mark {status}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <h3>Tracking details</h3>
            <form onSubmit={saveTracking}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="carrier">Carrier / rider</label>
                  <input
                    id="carrier"
                    value={tracking.carrier}
                    onChange={(e) => setTracking((t) => ({ ...t, carrier: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="trackingCode">Tracking code</label>
                  <input
                    id="trackingCode"
                    value={tracking.trackingCode}
                    onChange={(e) => setTracking((t) => ({ ...t, trackingCode: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="estimatedDelivery">Estimated delivery</label>
                <input
                  id="estimatedDelivery"
                  value={tracking.estimatedDelivery}
                  onChange={(e) => setTracking((t) => ({ ...t, estimatedDelivery: e.target.value }))}
                  placeholder="Today, 6 PM"
                />
              </div>
              <div className="field">
                <label htmlFor="trackingNote">Add a timeline note</label>
                <input
                  id="trackingNote"
                  value={tracking.note}
                  onChange={(e) => setTracking((t) => ({ ...t, note: e.target.value }))}
                  placeholder="Packed and cooling"
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                Save tracking
              </button>
            </form>
          </section>

          <section className="panel">
            <h3>Timeline</h3>
            <OrderTimeline order={order} />
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <h3>Customer</h3>
            <p className="small" style={{ lineHeight: 1.8, margin: 0 }}>
              <strong>{order.user?.name || order.shippingAddress.recipientName}</strong>
              <br />
              {order.user?.email}
              <br />
              📞 {order.shippingAddress.phone}
            </p>
          </section>

          <section className="panel">
            <h3>Delivery address</h3>
            <p className="small" style={{ lineHeight: 1.8, margin: 0 }}>
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.city}
              {order.shippingAddress.district ? `, ${order.shippingAddress.district}` : ''}
              <br />
              {order.shippingAddress.landmark}
            </p>
            {order.shippingAddress.notes && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Note: {order.shippingAddress.notes}
              </p>
            )}
          </section>

          <section className="panel">
            <h3>Payment</h3>
            <div className="summary-line">
              <span>Method</span>
              <span>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
            </div>
            <div className="summary-line">
              <span>Status</span>
              <StatusBadge status={order.paymentStatus} kind="payment" />
            </div>
            {order.payment?.transactionUuid && (
              <div className="summary-line">
                <span>Transaction</span>
                <span className="small">{order.payment.transactionUuid}</span>
              </div>
            )}
            {order.payment?.referenceId && (
              <div className="summary-line">
                <span>eSewa ref</span>
                <span className="small">{order.payment.referenceId}</span>
              </div>
            )}
            {order.payment?.paidAt && (
              <div className="summary-line">
                <span>Paid at</span>
                <span className="small">{formatDate(order.payment.paidAt)}</span>
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Items</h3>
            {order.items.map((item) => (
              <div className="summary-line" key={item.slug}>
                <span>
                  {item.name} <span className="muted">× {item.quantity}</span>
                </span>
                <span>{formatNpr(item.subtotal)}</span>
              </div>
            ))}
            <div className="summary-line">
              <span>Delivery</span>
              <span>{order.deliveryCharge ? formatNpr(order.deliveryCharge) : 'Free'}</span>
            </div>
            <div className="summary-line total">
              <span>Total</span>
              <span>{formatNpr(order.totalAmount)}</span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
