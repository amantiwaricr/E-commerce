import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import PaymentPicker from '../components/PaymentPicker';
import { ShieldIcon } from '../components/icons';
import { formatNpr } from '../utils/format';
import { submitEsewaForm } from '../utils/esewa';
import useSeo from '../hooks/useSeo';
import { seoFor } from '../seo/pages';

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
  useSeo({ ...seoFor('/checkout'), path: '/checkout' });

  const { user, refreshUser } = useAuth();
  const { cart, refreshCart, deliveryMethod } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [address, setAddress] = useState(BLANK_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState('esewa');
  const [methods, setMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const savedAddresses = user?.addresses || [];
  // -1 means "enter a new address"; 0 is the most recently used one.
  const [selected, setSelected] = useState(savedAddresses.length ? 0 : -1);

  const applySaved = (saved) =>
    setAddress((current) => ({
      ...current,
      recipientName: saved?.recipientName || user?.name || '',
      phone: saved?.phone || user?.phone || '',
      street: saved?.street || '',
      city: saved?.city || 'Kathmandu',
      district: saved?.district || 'Bagmati',
      landmark: saved?.landmark || '',
    }));

  // Prefill with the address this customer used last.
  useEffect(() => {
    if (!user) return;
    if (savedAddresses.length) {
      setSelected(0);
      applySaved(savedAddresses[0]);
    } else {
      setAddress((current) => ({
        ...current,
        recipientName: user.name || '',
        phone: user.phone || '',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const chooseAddress = (index) => {
    setSelected(index);
    if (index >= 0) applySaved(savedAddresses[index]);
    else setAddress({ ...BLANK_ADDRESS, recipientName: user?.name || '', phone: user?.phone || '' });
  };

  useEffect(() => {
    api
      .get('/payments/methods')
      .then(({ data }) => {
        const list = Array.isArray(data.methods) ? data.methods : [];
        setMethods(list);
        // The default is only a default while it is actually offered — a store
        // with eSewa switched off must not submit `esewa` because nothing ever
        // moved the selection off it.
        if (!list.some((m) => m.id === 'esewa' && m.enabled)) {
          const first = list.find((m) => m.enabled);
          if (first) setPaymentMethod(first.id);
        }
      })
      .catch(() => setMethods([]))
      .finally(() => setMethodsLoading(false));
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
      const { data } = await api.post('/orders', { paymentMethod, deliveryMethod, shippingAddress: address });

      if (data.payment) {
        // Hand the browser to eSewa with the server-signed payload.
        toast.notify('Redirecting you to eSewa…');
        submitEsewaForm(data.payment);
        return;
      }

      await refreshCart();
      // The order saved this address; pick it up so the next checkout is filled in.
      refreshUser();
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
          actionTo="/shop"
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
            <h3>{deliveryMethod === 'pickup' ? 'Contact details for pick-up' : 'Delivery address'}</h3>

            {savedAddresses.length > 0 && (
              <div className="saved-addresses">
                {savedAddresses.map((saved, index) => (
                  <button
                    type="button"
                    key={`${saved.street}-${index}`}
                    className={`saved-address ${selected === index ? 'on' : ''}`}
                    onClick={() => chooseAddress(index)}
                  >
                    <span className="tickdot" aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <strong className="truncate" style={{ display: 'block' }}>{saved.street}</strong>
                      <span className="small muted">
                        {saved.city}
                        {saved.district ? `, ${saved.district}` : ''} · {saved.phone}
                      </span>
                    </span>
                    {index === 0 && <span className="badge info">Default</span>}
                  </button>
                ))}

                <button
                  type="button"
                  className={`saved-address ${selected === -1 ? 'on' : ''}`}
                  onClick={() => chooseAddress(-1)}
                >
                  <span className="tickdot" aria-hidden="true" />
                  <span>Use a different address</span>
                </button>
              </div>
            )}

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

        </div>

        {/* Summary, then payment, then the button. Deciding how to pay is the
            last thing you do before paying, so it belongs next to the amount —
            not above the address form, two scrolls away from the total it
            applies to. */}
        <aside className="checkout-side">
          <section className="panel summary-card">
            <h3>Order summary</h3>

            <div className="summary-items">
              {cart.items.map((item) => (
                <div className="summary-line" key={item.productId || item.product}>
                  <span className="truncate">
                    {item.name} <span className="muted">× {item.quantity}</span>
                  </span>
                  <span>{formatNpr(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <div className="summary-line" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 12 }}>
              <span>Items total</span>
              <span>{formatNpr(cart.itemsTotal)}</span>
            </div>
            <div className="summary-line">
              <span>{deliveryMethod === 'pickup' ? 'Pick up in store' : 'Delivery'}</span>
              <span>{cart.deliveryCharge ? formatNpr(cart.deliveryCharge) : 'Free'}</span>
            </div>

            <div className="summary-total">
              <span>Total payable</span>
              <strong>{formatNpr(cart.totalAmount)}</strong>
            </div>

            <div className="summary-split">
              <h4>Payment method</h4>
              <PaymentPicker
                methods={methods}
                value={paymentMethod}
                onChange={setPaymentMethod}
                loading={methodsLoading}
              />
            </div>

            <button type="submit" className="btn block pay-btn" disabled={submitting || !methods.length}>
              {submitting
                ? 'Placing your order…'
                : paymentMethod === 'cod'
                  ? `Place order · ${formatNpr(cart.totalAmount)}`
                  : `Pay ${formatNpr(cart.totalAmount)}`}
            </button>

            <p className="pay-assure">
              <ShieldIcon width={14} height={14} />
              <span>Encrypted over TLS. A confirmation with a tracking link is emailed to you.</span>
            </p>
          </section>
        </aside>
      </form>
    </div>
  );
}
