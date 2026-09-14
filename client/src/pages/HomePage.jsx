import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Emblem from '../components/Emblem';
import ThemeToggle from '../components/ThemeToggle';
import {
  ArrowRight, BoxIcon, CartIcon, ClockIcon, FarmIcon, GridIcon, LeafIcon,
  MailIcon, PhoneIcon, PinIcon, RouteIcon, SearchIcon, ShieldIcon, SnowIcon,
  StarIcon, UserIcon, WalletIcon,
} from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatNpr } from '../utils/format';
import {
  CATEGORIES, FREE_DELIVERY_THRESHOLD, HERO_IMAGE, STORE_ADDRESS, STORE_DIRECTIONS_LINK,
  STORE_MAP_EMBED_URL, STORE_MAP_LINK, STORE_NAME, SUPPORT_EMAIL, SUPPORT_PHONE,
} from '../config';

/** Marketing copy for the hero badges — edit these to match the business. */
const PROMISES = [
  { Icon: FarmIcon, title: 'Cut To Order', note: 'Same morning' },
  { Icon: SnowIcon, title: 'Cold Chain', note: 'Never re-frozen' },
  { Icon: ShieldIcon, title: 'Halal Certified', note: '100% Halal' },
];

/** Footer link columns — every destination is a route that actually exists. */
const FOOTER_LINKS = [
  {
    title: 'Shop',
    links: [
      { label: 'Meat Market', to: '/shop' },
      ...CATEGORIES.map((name) => ({ label: name, to: `/shop?category=${encodeURIComponent(name)}` })),
    ],
  },
  {
    title: 'Your account',
    links: [
      { label: 'Orders & tracking', to: '/orders' },
      { label: 'Favourites', to: '/favourites' },
      { label: 'Basket', to: '/cart' },
      { label: 'Profile', to: '/profile' },
    ],
  },
  {
    title: 'Ordering',
    links: [
      { label: 'How it works', to: '#how', hash: true },
      { label: 'Create an account', to: '/register' },
      { label: 'Sign in', to: '/login' },
      { label: 'Visit the shop', to: '#visit', hash: true },
    ],
  },
];

const PAYMENT_NOTES = [
  { Icon: WalletIcon, label: 'eSewa wallet' },
  { Icon: ShieldIcon, label: 'Debit / credit card' },
  { Icon: BoxIcon, label: 'Cash on delivery' },
];

const STEPS = [
  { n: 'STEP 01', h: 'Pick your cut', p: 'Browse fresh, processed, marinated and seafood lines with live stock counts from the shop floor.' },
  { n: 'STEP 02', h: 'Pay your way', p: 'eSewa wallet, debit or credit card through eSewa, or simply pay the rider cash on delivery.' },
  { n: 'STEP 03', h: 'Track to your door', p: 'Every order gets a live timeline plus email and WhatsApp updates until it is handed over.' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { user, isAuthenticated } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [facets, setFacets] = useState(null);
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    api.get('/products', { params: { limit: 8, sort: 'rating' } })
      .then(({ data }) => setProducts(data.products))
      .catch(() => setProducts([]));
    api.get('/products/facets')
      .then(({ data }) => setFacets(data.facets))
      .catch(() => setFacets(null));
  }, []);

  // Headline figures come from the catalogue, never from invented numbers.
  const stats = useMemo(() => {
    if (!products.length) return { rating: null, reviews: 0 };
    const rated = products.filter((p) => p.rating > 0);
    const rating = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : null;
    const reviews = products.reduce((s, p) => s + (p.reviewCount || 0), 0);
    return { rating, reviews };
  }, [products]);

  // A purpose-shot hero wins; otherwise fall back to the best-rated product.
  const heroImage = HERO_IMAGE || products.find((p) => p.images?.[0])?.images[0];
  // Falls back on an empty list too, not just a failed request.
  const categoryCounts = facets?.categories?.length
    ? facets.categories
    : CATEGORIES.map((name) => ({ name, count: 0 }));

  return (
    <div className="home">
      <header className="home-nav">
        <Link to="/" className="home-brand">
          <Emblem className="emblem" />
          <span>
            <span className="word">FRESH MEAT</span>
            <span className="sub">NEPAL</span>
          </span>
        </Link>

        <nav className={`nav-pill ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
          <span className="dots" aria-hidden="true"><GridIcon width={16} height={16} /></span>
          <Link to="/" className="active">Home</Link>
          <a href="#how">About</a>
          <Link to="/shop">Meat Market</Link>
          <a href="#visit">Contact</a>
          <button type="button" className="nav-search" aria-label="Search the shop" onClick={() => navigate('/shop')}>
            <SearchIcon width={16} height={16} />
          </button>
        </nav>

        <button
          type="button"
          className="home-burger"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>

        <ThemeToggle className="on-dark" />

        <Link to={isAuthenticated ? '/orders' : '/login'} className="home-login">
          {isAuthenticated ? user.name.split(' ')[0] : 'Log In'}
          <span className="ico"><UserIcon width={15} height={15} /></span>
        </Link>
      </header>

      <section className="hero">
        <div className={`hero-photo ${heroBroken || !heroImage ? 'empty' : ''}`}>
          {heroImage && !heroBroken && (
            <img src={heroImage} alt="" onError={() => setHeroBroken(true)} />
          )}
        </div>

        <div className="hero-inner wrap">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="rule" />
              Fresh &amp; Premium
              <LeafIcon width={20} height={20} />
            </p>

            <h1 className="hero-title">
              <span className="l1">Fresh Meat</span>
              <span className="l2">Nepal</span>
            </h1>

            <p className="hero-sub">
              100% Natural <span className="sep" /> Farm Fresh <span className="sep" /> Halal Certified
            </p>

            <div className="hero-stats">
              <div>
                <div className="stat-big">{stats.rating ? stats.rating.toFixed(1) : '—'}</div>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <StarIcon key={n} filled={n <= Math.round(stats.rating || 0)} />
                  ))}
                </div>
                <div className="stat-label">Customer Rating</div>
              </div>

              <span className="divider" />

              <div>
                <div className="stat-big">
                  {stats.reviews >= 1000 ? `${(stats.reviews / 1000).toFixed(1)}K+` : stats.reviews}
                </div>
                <div className="faces">
                  {['S', 'R', 'A'].map((f) => <span key={f}>{f}</span>)}
                </div>
                <div className="stat-label">Customer Reviews</div>
              </div>
            </div>

            <div className="promises">
              {PROMISES.map(({ Icon, title, note }) => (
                <div className="promise" key={title}>
                  <span className="ico"><Icon width={17} height={17} /></span>
                  <span>
                    <b>{title}</b>
                    <small>{note}</small>
                  </span>
                </div>
              ))}
            </div>

            <div className="hero-foot" id="contact">
              <div className="touch">
                Get in Touch:
                <a
                  className="round-btn"
                  href="https://maps.google.com/?q=Kathmandu+Nepal"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Find us on the map"
                >
                  <PinIcon width={18} height={18} />
                </a>
                <a className="round-btn" href={`tel:${SUPPORT_PHONE}`} aria-label={`Call ${SUPPORT_PHONE}`}>
                  <PhoneIcon width={18} height={18} />
                </a>
              </div>

              <Link className="cta-pill" to="/shop">
                Shop Meat Market
                <CartIcon width={19} height={19} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Shop by <em>category</em></h2>
              <p>Every cut is butchered to order and delivered chilled across Kathmandu Valley.</p>
            </div>
            <Link className="cta-pill" to="/shop">Browse all <ArrowRight width={17} height={17} /></Link>
          </div>

          <div className="cat-grid">
            {categoryCounts.map(({ name, count }) => (
              <Link className="cat-card" key={name} to={`/shop?category=${encodeURIComponent(name)}`}>
                <ArrowRight className="go" width={18} height={18} />
                <div className="n">{name}</div>
                <div className="c">{count} {count === 1 ? 'product' : 'products'}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {products.length > 0 && (
        <section className="home-section">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Best <em>rated</em> today</h2>
                <p>The cuts our customers come back for, ranked by their own reviews.</p>
              </div>
            </div>

            <div className="home-grid">
              {products.slice(0, 8).map((product) => (
                <article className="home-card" key={product._id || product.id}>
                  <Link className="shot" to={`/products/${product.slug}`}>
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.name} loading="lazy"
                           onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <span className="none">No image</span>
                    )}
                    {product.rating >= 4.8 && <span className="tag">Top rated</span>}
                  </Link>

                  <div className="meta">
                    <Link className="nm" to={`/products/${product.slug}`}>{product.name}</Link>
                    {product.rating > 0 && (
                      <span className="rt">
                        <StarIcon /> {product.rating.toFixed(1)}
                        <span style={{ color: 'var(--paper-3)', fontWeight: 500 }}>({product.reviewCount})</span>
                      </span>
                    )}
                    <div className="pr">
                      <b>{formatNpr(product.price)} <span>/ {product.unit}</span></b>
                      <button
                        type="button"
                        className="buy"
                        disabled={product.stock <= 0}
                        onClick={() => addItem(product, 1)}
                      >
                        {product.stock > 0 ? 'Add' : 'Out'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="home-section" id="how">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>How it <em>works</em></h2>
              <p>From the block to your kitchen, in three steps.</p>
            </div>
          </div>

          <div className="steps">
            {STEPS.map(({ n, h, p }) => (
              <div className="step" key={n}>
                <div className="num">{n}</div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="wrap">
          <div className="band">
            <div>
              <h2>Ready when <em>you</em> are</h2>
              <p>Order before 4 PM for same-day delivery inside the Valley, or collect in store with no delivery charge.</p>
            </div>
            <Link className="cta-pill" to="/shop">
              Shop Meat Market
              <CartIcon width={19} height={19} />
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section" id="visit">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Visit the <em>counter</em></h2>
              <p>Pick up in store with no delivery charge, or come and choose your cut at the block.</p>
            </div>
          </div>

          <div className="visit">
            <div className="visit-info">
              <div className="visit-line">
                <span className="ico"><PinIcon width={17} height={17} /></span>
                <div>
                  <h3>Our shop</h3>
                  <p>
                    {STORE_ADDRESS.line1}
                    <br />
                    {STORE_ADDRESS.line2}
                  </p>
                </div>
              </div>

              <div className="visit-line">
                <span className="ico"><ClockIcon width={17} height={17} /></span>
                <div>
                  <h3>Opening hours</h3>
                  <p>{STORE_ADDRESS.hours}</p>
                </div>
              </div>

              <div className="visit-line">
                <span className="ico"><PhoneIcon width={17} height={17} /></span>
                <div>
                  <h3>Talk to us</h3>
                  <p>
                    <a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>{SUPPORT_PHONE}</a>
                    <br />
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                  </p>
                </div>
              </div>

              <div className="visit-actions">
                <a className="cta-pill" href={STORE_DIRECTIONS_LINK} target="_blank" rel="noreferrer">
                  Get directions
                  <RouteIcon width={18} height={18} />
                </a>
                <a className="ghost-pill" href={STORE_MAP_LINK} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              </div>
            </div>

            <div className="visit-map">
              {/*
                Keyless Google Maps embed — no API key, no billing account
                needed. The caption below it is always rendered rather than
                shown on failure: a blocked frame fires `load` for the browser's
                own error page, so there is no reliable way to detect one, and
                this way the panel is never left without an address.
              */}
              <iframe
                src={STORE_MAP_EMBED_URL}
                title={`${STORE_NAME} on Google Maps — ${STORE_ADDRESS.line1}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />

              <div className="map-caption">
                <PinIcon width={15} height={15} />
                <span>
                  {STORE_ADDRESS.line1}, {STORE_ADDRESS.line2}
                </span>
                <a href={STORE_MAP_LINK} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <div className="home-brand">
                <Emblem className="emblem" />
                <div>
                  <div className="word">{STORE_NAME}</div>
                  <span className="sub">FRESH · HALAL · NEPAL</span>
                </div>
              </div>
              <p>
                Meat cut to order the morning you buy it, kept in an unbroken cold chain from our
                Balkumari counter to your kitchen anywhere in the Kathmandu Valley.
              </p>

              <div className="foot-contact">
                <a href={STORE_MAP_LINK} target="_blank" rel="noreferrer">
                  <PinIcon width={15} height={15} />
                  {STORE_ADDRESS.line1}, {STORE_ADDRESS.line2}
                </a>
                <a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>
                  <PhoneIcon width={15} height={15} />
                  {SUPPORT_PHONE}
                </a>
                <a href={`mailto:${SUPPORT_EMAIL}`}>
                  <MailIcon width={15} height={15} />
                  {SUPPORT_EMAIL}
                </a>
                <span>
                  <ClockIcon width={15} height={15} />
                  {STORE_ADDRESS.hours}
                </span>
              </div>
            </div>

            {FOOTER_LINKS.map((column) => (
              <nav className="foot-col" key={column.title} aria-label={column.title}>
                <h4>{column.title}</h4>
                <ul>
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      {link.hash ? (
                        <a href={link.to}>{link.label}</a>
                      ) : (
                        <Link to={link.to}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="foot-pay">
            <span className="foot-pay-label">We accept</span>
            {PAYMENT_NOTES.map(({ Icon, label }) => (
              <span className="pay-chip" key={label}>
                <Icon width={15} height={15} />
                {label}
              </span>
            ))}
            <span className="foot-pay-note">
              Free delivery inside the Valley over {formatNpr(FREE_DELIVERY_THRESHOLD)} · Order before
              4 PM for same-day delivery
            </span>
          </div>

          <div className="foot-bottom">
            <span>
              © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
            </span>
            <span>
              Registered in Lalitpur, Bagmati Province, Nepal · Prices in Nepalese rupees, inclusive
              of applicable taxes
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
