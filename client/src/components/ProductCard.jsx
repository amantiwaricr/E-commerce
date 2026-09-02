import { Link } from 'react-router-dom';
import { formatNpr } from '../utils/format';
import { useCart } from '../context/CartContext';

export default function ProductCard({ product }) {
  const { addItem, loading } = useCart();
  const outOfStock = !product.isAvailable || product.stock <= 0;

  return (
    <article className="product-card">
      <Link to={`/products/${product.slug}`} className="product-thumb">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" />
        ) : (
          <div className="placeholder">No image</div>
        )}
      </Link>

      <div className="body">
        <span className="badge">{product.category}</span>
        <h3>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="price">
          {formatNpr(product.price)} <span>/ {product.unit}</span>
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          {outOfStock ? 'Out of stock' : `${product.stock} ${product.unit} available`}
        </p>

        <button
          type="button"
          className="btn block"
          style={{ marginTop: 'auto' }}
          disabled={outOfStock || loading}
          onClick={() => addItem(product, 1)}
        >
          {outOfStock ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
}
