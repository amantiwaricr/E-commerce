import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import QuantityStepper from '../components/QuantityStepper';
import { formatNpr } from '../utils/format';

export default function CartPage() {
  const { cart, updateItem, removeItem, clearCart, loading } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!cart.items.length) {
    return (
      <div className="container page">
        <EmptyState
          title="Your cart is empty"
          message="Add some fresh cuts and they will show up here."
          actionLabel="Browse the catalogue"
          actionTo="/products"
        />
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Your cart</h1>
        <button type="button" className="btn secondary sm" onClick={clearCart} disabled={loading}>
          Clear cart
        </button>
      </div>

      <div className="checkout-grid">
        <div className="panel">
          {cart.items.map((item) => (
            <div className="cart-line" key={item.productId || item.product}>
              {item.image ? <img src={item.image} alt="" /> : <div className="placeholder" />}

              <div>
                <Link to={`/products/${item.slug}`}>
                  <strong>{item.name}</strong>
                </Link>
                <p className="small muted" style={{ margin: '4px 0' }}>
                  {formatNpr(item.price)} / {item.unit}
                </p>
                <div className="row line-actions">
                  <QuantityStepper
                    value={item.quantity}
                    max={item.maxQuantity || 99}
                    onChange={(quantity) => updateItem(item.productId || item.product, quantity)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => removeItem(item.productId || item.product)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <strong>{formatNpr(item.subtotal)}</strong>
            </div>
          ))}
        </div>

        <aside className="panel">
          <h3>Order summary</h3>

          <div className="summary-line">
            <span>Items total</span>
            <span>{formatNpr(cart.itemsTotal)}</span>
          </div>
          <div className="summary-line">
            <span>Delivery</span>
            <span>{cart.deliveryCharge ? formatNpr(cart.deliveryCharge) : 'Free'}</span>
          </div>
          <div className="summary-line total">
            <span>Total</span>
            <span>{formatNpr(cart.totalAmount)}</span>
          </div>

          {!isAuthenticated && (
            <p className="alert info" style={{ marginTop: 14 }}>
              Sign in with Google to check out — your cart will come with you.
            </p>
          )}

          <button
            type="button"
            className="btn block"
            style={{ marginTop: 14 }}
            disabled={loading}
            onClick={() => navigate(isAuthenticated ? '/checkout' : '/login', { state: { from: { pathname: '/checkout' } } })}
          >
            {isAuthenticated ? 'Proceed to checkout' : 'Sign in to check out'}
          </button>

          <Link className="btn secondary block" to="/products" style={{ marginTop: 10 }}>
            Keep shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
