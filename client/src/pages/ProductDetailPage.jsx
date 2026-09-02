import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import QuantityStepper from '../components/QuantityStepper';
import { useCart } from '../context/CartContext';
import { formatNpr } from '../utils/format';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { addItem, loading: cartLoading } = useCart();
  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setQuantity(1);
    setActiveImage(0);

    api
      .get(`/products/${slug}`)
      .then(({ data }) => setProduct(data.product))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <Loader />;
  if (error || !product) {
    return (
      <div className="container page">
        <EmptyState title="Product not found" message={error} actionLabel="Back to catalogue" actionTo="/products" />
      </div>
    );
  }

  const outOfStock = !product.isAvailable || product.stock <= 0;

  return (
    <div className="container page">
      <p className="small muted">
        <Link to="/products">← Back to catalogue</Link>
      </p>

      <div className="checkout-grid">
        <div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="product-thumb" style={{ aspectRatio: '16 / 10' }}>
              {product.images?.[activeImage] ? (
                <img src={product.images[activeImage]} alt={product.name} />
              ) : (
                <div className="placeholder">No image available</div>
              )}
            </div>
          </div>

          {product.images?.length > 1 && (
            <div className="row" style={{ marginTop: 12 }}>
              {product.images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  style={{
                    padding: 0,
                    border: index === activeImage ? '2px solid var(--brand)' : '1px solid var(--line)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'none',
                  }}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={image} alt="" style={{ width: 64, height: 64, objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}

          <div className="panel" style={{ marginTop: 18 }}>
            <h3>Description</h3>
            <p className="muted" style={{ whiteSpace: 'pre-line', margin: 0 }}>
              {product.description}
            </p>
          </div>
        </div>

        <aside className="panel">
          <span className="badge">{product.category}</span>
          <h1 style={{ fontSize: '1.4rem', marginTop: 10 }}>{product.name}</h1>

          <p className="price" style={{ fontSize: '1.5rem' }}>
            {formatNpr(product.price)} <span>/ {product.unit}</span>
          </p>

          <p className={`badge ${outOfStock ? 'danger' : 'ok'}`}>
            {outOfStock ? 'Out of stock' : `${product.stock} ${product.unit} in stock`}
          </p>

          <div className="row" style={{ margin: '18px 0' }}>
            <QuantityStepper
              value={quantity}
              max={Math.min(99, product.stock || 1)}
              onChange={setQuantity}
              disabled={outOfStock}
            />
            <span className="small muted">
              Subtotal: <strong>{formatNpr(product.price * quantity)}</strong>
            </span>
          </div>

          <button
            type="button"
            className="btn block"
            disabled={outOfStock || cartLoading}
            onClick={() => addItem(product, quantity)}
          >
            {outOfStock ? 'Out of stock' : 'Add to cart'}
          </button>

          <ul className="small muted" style={{ paddingLeft: 18, marginTop: 18, lineHeight: 1.9 }}>
            <li>Delivered chilled, same day inside the Valley</li>
            <li>Pay with eSewa, card, or cash on delivery</li>
            <li>Free delivery on orders over Rs. 3,000</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
