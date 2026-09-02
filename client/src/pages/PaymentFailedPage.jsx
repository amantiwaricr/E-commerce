import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentFailedPage() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');
  const orderNumber = searchParams.get('order');

  return (
    <div className="container page" style={{ maxWidth: 560 }}>
      <div className="panel" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem' }}>Payment not completed</h1>
        <p className="muted">
          {reason || 'Your payment was cancelled or could not be verified, so the order was not confirmed.'}
        </p>

        {orderNumber && (
          <p className="small muted">
            Order <strong>{orderNumber}</strong> was cancelled and the stock released. Nothing has been charged.
          </p>
        )}

        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <Link className="btn" to="/cart">
            Back to cart
          </Link>
          <Link className="btn secondary" to="/orders">
            View my orders
          </Link>
        </div>
      </div>
    </div>
  );
}
