import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartIcon, HeartIcon } from './icons';
import { formatNpr } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

const idOf = (product) => product.id || product._id;

/** Products this well reviewed earn the amber flag, as in the reference. */
const isTopItem = (product) => product.rating >= 4.8;

export default function ProductCard({ product }) {
  const { addItem, loading } = useCart();
  const { isFavourite, toggle } = useFavourites();

  const id = idOf(product);
  const out = !product.isAvailable || product.stock <= 0;
  const on = isFavourite(id);
  const [broken, setBroken] = useState(false);
  const image = !broken && product.images?.[0];

  return (
    <article className="pcard">
      <Link className="pcard-tile" to={`/products/${product.slug}`}>
        {image ? (
          <img src={image} alt={product.name} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="noimg">No image</div>
        )}
        {isTopItem(product) && <span className="top-item">Top item</span>}
      </Link>

      <button
        type="button"
        className={`heart ${on ? 'on' : ''}`}
        onClick={() => toggle(id)}
        aria-pressed={on}
        aria-label={on ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`}
      >
        <HeartIcon filled={on} />
      </button>

      <div className="pcard-body">
        <span className="pcard-cat">{product.category}</span>

        <h3 className="pcard-title" title={product.name}>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>

        <p className="pcard-price">
          <strong>{formatNpr(product.price)}</strong>
          <span> / {product.unit}</span>
          {product.compareAtPrice > product.price && (
            <span className="price-was">{formatNpr(product.compareAtPrice)}</span>
          )}
        </p>

        <button
          type="button"
          className="price-pill"
          disabled={out || loading}
          onClick={() => addItem(product, 1)}
          title={out ? 'Out of stock' : `Add ${product.name} to cart`}
        >
          <span className="puck"><CartIcon width={14} height={14} /></span>
          {out ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
}
