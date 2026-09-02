import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import OrderTimeline from '../components/OrderTimeline';
import { useToast } from '../context/ToastContext';
import { formatDate, formatNpr } from '../utils/format';
import { PAYMENT_METHOD_LABELS } from '../config';
import { submitEsewaForm } from '../utils/esewa';

const CANCELLABLE = ['pending', 'confirmed', 'processing'];

export default function OrderDetailPage() {
  const { orderNumber } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${orderNumber}`);
      setOrder(data.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the order is still moving so the timeline stays live.
  useEffect(() => {
    if (!order || ['delivered', 'cancelled'].includes(order.orderStatus)) return undefined;
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [order, load]);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') toast.success('Payment received — your order is confirmed.');
    // Only announce the redirect result once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order? Reserved stock will be released.')) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${orderNumber}/cancel`, { reason: 'Cancelled by customer' });
      setOrder(data.order);
      toast.success('Order cancelled.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const retryPayment = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${orderNumber}/pay`);
      submitEsewaForm(data.payment);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (loading) return <Loader label="Loading your order…" />;
  if (error || !order) {
    return (
      <div className="container page">
        <EmptyState title="Order not found" message={error} actionLabel="Back to my orders" actionTo="/orders" />
      </div>
    );
  }

  const canRetryPayment =
    ['esewa', 'card'].includes(order.paymentMethod) &&
    order.paymentStatus !== 'paid' &&
    order.orderStatus !== 'cancelled';

  return (
    <div className="container page">
      <p className="small muted">
        <Link to="/orders">← All orders</Link>
      </p>

      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: 6 }}>Order {order.orderNumber}</h1>
          <div className="row">
            <StatusBadge status={order.orderStatus} />
            <StatusBadge status={order.paymentStatus} kind="payment" />
            <span className="small muted">Placed {formatDate(order.placedAt || order.createdAt)}</span>
          </div>
        </div>

        <div className="row">
          {canRetryPayment && (
            <button type="button" className="btn" onClick={retryPayment} disabled={busy}>
              Pay now
            </button>
          )}
          {CANCELLABLE.includes(order.orderStatus) && (
            <button type="button" className="btn secondary" onClick={cancelOrder} disabled={busy}>
              Cancel order
            </button>
          )}
        </div>
      </div>

      <div className="checkout-grid">
        <div className="stack">
          <section className="panel">
            <h3>Tracking</h3>
            {order.trackingInfo?.trackingCode && (
              <p className="small muted">
                {order.trackingInfo.carrier || 'Courier'} · code <strong>{order.trackingInfo.trackingCode}</strong>
              </p>
            )}
            {order.trackingInfo?.estimatedDelivery && (
              <p className="small muted">Expected: {order.trackingInfo.estimatedDelivery}</p>
            )}
            <OrderTimeline order={order} />
          </section>

          <section className="panel">
            <h3>Items</h3>
            {order.items.map((item) => (
              <div className="cart-line" key={item.slug}>
                {item.image ? <img src={item.image} alt="" /> : <div className="placeholder" />}
                <div>
                  <strong>{item.name}</strong>
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    {formatNpr(item.price)} / {item.unit} × {item.quantity}
                  </p>
                </div>
                <strong>{formatNpr(item.subtotal)}</strong>
              </div>
            ))}
          </section>
        </div>

        <aside className="stack">
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
            {order.payment?.referenceId && (
              <div className="summary-line">
                <span>eSewa reference</span>
                <span>{order.payment.referenceId}</span>
              </div>
            )}
            <div className="summary-line">
              <span>Items total</span>
              <span>{formatNpr(order.itemsTotal)}</span>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <span>{order.deliveryCharge ? formatNpr(order.deliveryCharge) : 'Free'}</span>
            </div>
            <div className="summary-line total">
              <span>Total</span>
              <span>{formatNpr(order.totalAmount)}</span>
            </div>
          </section>

          <section className="panel">
            <h3>Delivering to</h3>
            <p className="small" style={{ lineHeight: 1.8, margin: 0 }}>
              <strong>{order.shippingAddress.recipientName}</strong>
              <br />
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.city}
              {order.shippingAddress.district ? `, ${order.shippingAddress.district}` : ''}
              <br />
              {order.shippingAddress.landmark && (
                <>
                  {order.shippingAddress.landmark}
                  <br />
                </>
              )}
              📞 {order.shippingAddress.phone}
            </p>
            {order.shippingAddress.notes && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Note: {order.shippingAddress.notes}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
