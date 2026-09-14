import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartIcon, StarIcon, TagIcon } from './icons';
import { formatNpr } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

const idOf = (product) => product.id || product._id;

/** Deterministic sample of recent scores, so the chips never reshuffle on render. */
const chipScores = (rating) => {
  const base = Number(rating) || 4.5;
  return [
    { score: base.toFixed(1), who: 'A' },
    { score: Math.min(5, base - 0.1).toFixed(1), who: 'S' },
    { score: '5.0', who: 'R' },
  ];
};

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

      {chipScores(product.rating).map((chip, i) => (
        <span className={`rating-chip c${i + 1}`} key={chip.who}>
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
          <TagIcon />
          {out ? 'Out of stock' : formatNpr(product.price)}
        </button>
      </div>
    </article>
  );
}
