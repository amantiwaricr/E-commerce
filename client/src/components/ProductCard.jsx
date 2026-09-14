import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartIcon, TagIcon } from './icons';
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
        <h3 className="pcard-title truncate" title={product.name}>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>

        <div className="price-row">
          {product.compareAtPrice > product.price && (
            <span className="price-was">{formatNpr(product.compareAtPrice)}</span>
          )}
          <button
            type="button"
            className="price-pill"
            disabled={out || loading}
            onClick={() => addItem(product, 1)}
            title={out ? 'Out of stock' : `Add ${product.name} to cart`}
          >
            <TagIcon />
            {out ? 'Out of stock' : formatNpr(product.price)}
          </button>
        </div>
      </div>
    </article>
  );
}
