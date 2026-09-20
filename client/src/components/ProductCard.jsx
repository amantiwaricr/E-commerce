import { useState } from 'react';
import { Link } from 'react-router-dom';
import Stars from './Stars';
import { CartIcon, HeartIcon } from './icons';
import { formatNpr } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

const idOf = (product) => product.id || product._id;

/** Products this well reviewed earn the gold flag, as in the reference. */
const isTopItem = (product) => product.rating >= 4.8;

/** Few enough left to be worth saying so. Above this it is just noise. */
const LOW_STOCK = 5;

export default function ProductCard({ product }) {
  const { addItem, loading } = useCart();
  const { isFavourite, toggle } = useFavourites();

  const id = idOf(product);
  const out = !product.isAvailable || product.stock <= 0;
  const low = !out && product.stock <= LOW_STOCK;
  const on = isFavourite(id);
  const [broken, setBroken] = useState(false);
  const image = !broken && product.images?.[0];
  const reviews = Number(product.reviewCount) || 0;

  return (
    <article className={`pcard ${out ? 'sold-out' : ''}`}>
      <div className="pcard-media">
        <Link className="pcard-tile" to={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true">
          {image ? (
            <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
          ) : (
            <div className="noimg">No image</div>
          )}
        </Link>

        {out ? (
          <span className="pcard-flag out">Sold out</span>
        ) : (
          isTopItem(product) && <span className="pcard-flag top">Top rated</span>
        )}

        <button
          type="button"
          className={`heart ${on ? 'on' : ''}`}
          onClick={() => toggle(id)}
          aria-pressed={on}
          aria-label={on ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`}
        >
          <HeartIcon filled={on} />
        </button>
      </div>

      <div className="pcard-body">
        <span className="pcard-cat">{product.category}</span>

        <h3 className="pcard-title">
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>

        {/* Shown only when someone has actually rated it. Five grey stars and a
            "(0)" is not neutral information — it reads as a bad product. */}
        {reviews > 0 && (
          <p className="pcard-rating">
            <Stars value={product.rating} size={13} />
            <strong>{Number(product.rating).toFixed(1)}</strong>
            <span>({reviews})</span>
          </p>
        )}

        <p className="pcard-price">
          <strong>{formatNpr(product.price)}</strong>
          <span>/ {product.unit}</span>
          {product.compareAtPrice > product.price && (
            <span className="price-was">{formatNpr(product.compareAtPrice)}</span>
          )}
        </p>

        {/* Kept off the layout entirely when there is nothing to say, so cards
            without it do not carry an empty line. */}
        {low && <p className="pcard-stock">Only {product.stock} left</p>}

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
