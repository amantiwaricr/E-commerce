import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartIcon, HeartIcon, StarIcon } from './icons';
import { formatNpr } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

const idOf = (product) => product.id || product._id;

/** The product's latest real ratings, newest first. None means no chips. */
const recentScores = (product) =>
  (product.recentRatings || []).slice(0, 3).map((r) => ({ score: Number(r.rating).toFixed(1), who: r.initial || '?' }));

/** Full-bleed hero tile occupying one grid cell. */
export default function FeatureCard({ product }) {
  const { addItem, loading } = useCart();
  const { isFavourite, toggle } = useFavourites();

  const id = idOf(product);
  const out = !product.isAvailable || product.stock <= 0;
  const on = isFavourite(id);
  // The tile keeps its gradient background when the photo cannot be loaded.
  const [broken, setBroken] = useState(false);

  return (
    <article className="feature">
      {!broken && product.images?.[0] && (
        <img src={product.images[0]} alt="" onError={() => setBroken(true)} />
      )}

      {recentScores(product).map((chip, i) => (
        <span className={`rating-chip c${i + 1}`} key={`${chip.who}-${i}`}>
          <span className="who">{chip.who}</span>
          {chip.score}/5
          <StarIcon />
        </span>
      ))}

      <button
        type="button"
        className={`heart ${on ? 'on' : ''}`}
        onClick={() => toggle(id)}
        aria-pressed={on}
        aria-label={on ? 'Remove from favourites' : 'Save to favourites'}
      >
        <HeartIcon filled={on} />
      </button>

      <div className="feature-body">
        <h3 className="feature-title">
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <button
          type="button"
          className="price-pill"
          disabled={out || loading}
          onClick={() => addItem(product, 1)}
        >
          <span className="puck"><CartIcon width={14} height={14} /></span>
          {out ? 'Out of stock' : formatNpr(product.price)}
        </button>
      </div>
    </article>
  );
}
