import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from './StatusBadge';
import InvoiceButton from './InvoiceButton';
import OrderProgress from './OrderProgress';
import { CartIcon, ClockIcon, RouteIcon, TruckIcon } from './icons';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatNpr } from '../utils/format';
import { PAYMENT_METHOD_LABELS } from '../config';

/** How many item thumbnails fit before the rest become a "+N". */
const THUMBS = 4;

/** "Goat curry cut, Buff mince and 2 more" — the order's contents in one line. */
const itemSummary = (items) => {
  const names = items.map((item) => item.name);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

export default function OrderCard({ order }) {
  const { refreshCart } = useCart();
  const toast = useToast();
  const [reordering, setReordering] = useState(false);

  const shown = order.items.slice(0, THUMBS);
  const overflow = order.items.length - shown.length;
  const eta = order.trackingInfo?.estimatedDelivery;
  const pickup = order.deliveryMethod === 'pickup';

  /*
   * Adds every line back to the cart. Each one is a separate request because
   * the catalogue moves on: a product can be delisted or out of stock months
   * after an order, and the rest of the basket should still arrive. What
   * failed is reported rather than swallowed.
   */
  const reorder = async () => {
    setReordering(true);
    try {
      const results = await Promise.allSettled(
        order.items.map((item) =>
          api.post('/cart/items', { productId: item.product, quantity: item.quantity })
        )
      );

      const failed = results.filter((result) => result.status === 'rejected').length;
      await refreshCart();

      if (failed === order.items.length) toast.error('None of these are available right now.');
      else if (failed) toast.success(`Added to your cart — ${failed} item(s) are no longer available.`);
      else toast.success('Added to your cart.');
    } finally {
      setReordering(false);
    }
  };

  return (
    <article className="ocard">
      <header className="ocard-head">
        <div>
          <Link className="ocard-number" to={`/orders/${order.orderNumber}`}>
            {order.orderNumber}
          </Link>
          <p className="ocard-meta">
            {formatDate(order.createdAt)} · {PAYMENT_METHOD_LABELS[order.paymentMethod]}
          </p>
        </div>
        <div className="ocard-badges">
          <StatusBadge status={order.orderStatus} />
          <StatusBadge status={order.paymentStatus} kind="payment" />
        </div>
      </header>

      <div className="ocard-items">
        <div className="ocard-thumbs">
          {shown.map((item, index) => (
            <span className="ocard-thumb" key={`${item.slug}-${index}`}>
              {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="noimg" />}
            </span>
          ))}
          {overflow > 0 && <span className="ocard-thumb more">+{overflow}</span>}
        </div>
        <p className="ocard-names">{itemSummary(order.items)}</p>
      </div>

      <OrderProgress order={order} />

      <footer className="ocard-foot">
        <p className="ocard-when">
          {order.orderStatus === 'cancelled' ? (
            <>
              <ClockIcon width={15} height={15} />
              {order.paymentStatus === 'refunded' ? 'Refunded' : 'No longer being delivered'}
            </>
          ) : order.orderStatus === 'delivered' ? (
            <>
              <TruckIcon width={15} height={15} />
              Delivered
            </>
          ) : pickup ? (
            <>
              <RouteIcon width={15} height={15} />
              Collect at the Balkumari counter
            </>
          ) : (
            <>
              <ClockIcon width={15} height={15} />
              {eta || 'Delivery time confirmed once the order is packed'}
            </>
          )}
        </p>

        <div className="ocard-actions">
          <span className="ocard-total">{formatNpr(order.totalAmount)}</span>
          <Link className="btn secondary sm" to={`/orders/${order.orderNumber}`}>
            Track
          </Link>
          <button type="button" className="btn ghost sm" onClick={reorder} disabled={reordering}>
            <CartIcon width={15} height={15} />
            {reordering ? 'Adding…' : 'Reorder'}
          </button>
          <InvoiceButton order={order} className="btn ghost sm" />
        </div>
      </footer>
    </article>
  );
}
