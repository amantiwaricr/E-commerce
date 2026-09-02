import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import ProductCard from '../components/ProductCard';
import Loader from '../components/Loader';
import { CATEGORIES, STORE_NAME } from '../config';

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/products', { params: { limit: 8, sort: 'newest' } })
      .then(({ data }) => setProducts(data.products))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Fresh meat, cut this morning. At your door today.</h1>
          <p>
            {STORE_NAME} sources khasi, buff, chicken, pork and fresh trout from trusted Nepali farms, then delivers
            them cold across Kathmandu Valley. Pay with eSewa, card, or cash on delivery.
          </p>
          <div className="row">
            <Link className="btn secondary" to="/products">
              Shop the catalogue
            </Link>
            <Link className="btn ghost" to="/products?availability=in-stock">
              What’s in stock today
            </Link>
          </div>
        </div>
      </section>

      <section className="container page">
        <div className="feature-grid">
          <div className="feature">
            <h3>🧊 Cold chain kept</h3>
            <p className="small muted">Chilled from butchery to doorstep — never frozen and thawed twice.</p>
          </div>
          <div className="feature">
            <h3>🇳🇵 Nepali payments</h3>
            <p className="small muted">eSewa wallet, card through eSewa, or cash when the rider arrives.</p>
          </div>
          <div className="feature">
            <h3>📦 Live tracking</h3>
            <p className="small muted">Follow every order from confirmation to delivery, with email and WhatsApp updates.</p>
          </div>
          <div className="feature">
            <h3>🔪 Cut to order</h3>
            <p className="small muted">Curry cut, boneless, mince or marinated — tell us at checkout.</p>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 24 }}>
        <div className="page-head">
          <h2 style={{ margin: 0 }}>Shop by category</h2>
        </div>
        <div className="chip-row">
          {CATEGORIES.map((category) => (
            <Link key={category} className="chip" to={`/products?category=${encodeURIComponent(category)}`}>
              {category}
            </Link>
          ))}
        </div>
      </section>

      <section className="container page">
        <div className="page-head">
          <h2 style={{ margin: 0 }}>Fresh in today</h2>
          <Link className="btn secondary sm" to="/products">
            View all
          </Link>
        </div>

        {loading ? (
          <Loader label="Loading today’s cuts…" />
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
