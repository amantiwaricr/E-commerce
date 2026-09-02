import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';
import { formatNpr } from '../utils/format';
import { submitEsewaForm } from '../utils/esewa';

const BLANK_ADDRESS = {
  recipientName: '',
  phone: '',
  street: '',
  city: 'Kathmandu',
  district: 'Bagmati',
  landmark: '',
  notes: '',
};

export default function CheckoutPage() {
  const { user } = useAuth();
  const { cart, refreshCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [address, setAddress] = useState(BLANK_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState('esewa');
  const [methods, setMethods] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Prefill from the profile, and offer the customer's most recent saved address.
  useEffect(() => {
    if (!user) return;
    const saved = user.addresses?.[0];
    setAddress((current) => ({
      ...current,
      recipientName: saved?.recipientName || user.name || '',
      phone: saved?.phone || user.phone || '',
      street: saved?.street || '',
      city: saved?.city || current.city,
      district: saved?.district || current.district,
      landmark: saved?.landmark || '',
    }));
  }, [user]);

  useEffect(() => {
    api
      .get('/payments/methods')
      .then(({ data }) => setMethods(data.methods))
      .catch(() => setMethods([]));
  }, []);

  const setField = (field) => (event) => {
    setAddress((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [`shippingAddress.${field}`]: undefined }));
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const { data } = await api.post('/orders', { paymentMethod, shippingAddress: address });

      if (data.payment) {
        // Hand the browser to eSewa with the server-signed payload.
        toast.notify('Redirecting you to eSewa…');
        submitEsewaForm(data.payment);
        return;
      }

      await refreshCart();
      toast.success(`Order ${data.order.orderNumber} placed! Check your email for the confirmation.`);
      navigate(`/orders/${data.order.orderNumber}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.fieldErrors || []).map((e) => [e.field, e.message])));
      setSubmitting(false);
      await refreshCart();
    }
  };

  if (!cart.items.length) {
    return (
      <div className="container page">
        <EmptyState
          title="Nothing to check out"
          message="Your cart is empty."
          actionLabel="Browse the catalogue"
          actionTo="/products"
        />
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Checkout</h1>
      </div>

      {error && <div className="alert error">{error}</div>}

      <form className="checkout-grid" onSubmit={placeOrder}>
        <div className="stack">
          <section className="panel">
            <h3>Delivery address</h3>

            <div className="field-row">
              <div className="field">
                <label htmlFor="recipientName">Full name</label>
                <input id="recipientName" value={address.recipientName} onChange={setField('recipientName')} required />
                {fieldErrors['shippingAddress.recipientName'] && (
                  <span className="error">{fieldErrors['shippingAddress.recipientName']}</span>
                )}
              </div>
              <div className="field">
                <label htmlFor="phone">Contact number</label>
                <input
                  id="phone"
                  value={address.phone}
                  onChange={setField('phone')}
                  placeholder="9801234567"
                  required
                />
                {fieldErrors['shippingAddress.phone'] && (
                  <span className="error">{fieldErrors['shippingAddress.phone']}</span>
                )}
                <span className="small muted">Order updates are sent to this number on WhatsApp.</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="street">Street address</label>
              <input id="street" value={address.street} onChange={setField('street')} required />
              {fieldErrors['shippingAddress.street'] && (
                <span className="error">{fieldErrors['shippingAddress.street']}</span>
              )}
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="city">City</label>
                <input id="city" value={address.city} onChange={setField('city')} required />
              </div>
              <div className="field">
                <label htmlFor="district">District</label>
                <input id="district" value={address.district} onChange={setField('district')} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="landmark">Landmark (optional)</label>
              <input id="landmark" value={address.landmark} onChange={setField('landmark')} placeholder="Near Labim Mall" />
            </div>

            <div className="field">
              <label htmlFor="notes">Delivery or cutting instructions (optional)</label>
              <textarea id="notes" rows={3} value={address.notes} onChange={setField('notes')} />
            </div>
          </section>

          <section className="panel">
            <h3>Payment method</h3>

            {methods.length === 0 ? (
              <Loader label="Loading payment options…" />
            ) : (
              methods.map((method) => (
                <label
                  key={method.id}
                  className={`pay-option ${paymentMethod === method.id ? 'selected' : ''} ${
                    method.enabled ? '' : 'disabled'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    disabled={!method.enabled}
                    onChange={() => setPaymentMethod(method.id)}
                  />
                  <span>
                    <strong>{method.label}</strong>
                    <br />
                    <span className="small muted">
                      {method.enabled ? method.description : 'Not enabled for this store yet'}
                    </span>
                  </span>
                </label>
              ))
            )}
          </section>
        </div>

        <aside className="panel">
          <h3>Order summary</h3>

          {cart.items.map((item) => (
            <div className="summary-line" key={item.productId || item.product}>
              <span>
                {item.name} <span className="muted">× {item.quantity}</span>
              </span>
              <span>{formatNpr(item.subtotal)}</span>
            </div>
          ))}

          <div className="summary-line" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 12 }}>
            <span>Items total</span>
            <span>{formatNpr(cart.itemsTotal)}</span>
          </div>
          <div className="summary-line">
            <span>Delivery</span>
            <span>{cart.deliveryCharge ? formatNpr(cart.deliveryCharge) : 'Free'}</span>
          </div>
          <div className="summary-line total">
            <span>Total payable</span>
            <span>{formatNpr(cart.totalAmount)}</span>
          </div>

          <button type="submit" className="btn block" style={{ marginTop: 16 }} disabled={submitting}>
            {submitting
              ? 'Placing your order…'
              : paymentMethod === 'cod'
                ? 'Place order'
                : `Pay ${formatNpr(cart.totalAmount)}`}
          </button>

          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            You will receive an order confirmation by email and WhatsApp with a tracking link.
          </p>
        </aside>
      </form>
    </div>
  );
}
