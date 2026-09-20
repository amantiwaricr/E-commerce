import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from './Logo';
import { CartIcon, HeartIcon, SearchIcon, WhatsAppIcon } from './icons';
import AccountMenu from './AccountMenu';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

/** Matches the reference header's link set, mapped onto routes we have. */
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/orders', label: 'Orders' },
  // Fragments of the landing page: NavLink would mark these active whenever
  // the pathname is "/", so they are plain links.
  { to: '/#visit', label: 'Visit Us', hash: true },
  { to: '/#how', label: 'How It Works', hash: true },
];

export default function TopBar() {
  const { isAuthenticated } = useAuth();
  const { itemCount } = useCart();
  const { ids } = useFavourites();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('search') || '');

  // Keep the box in step when the term changes elsewhere (chips, reset, back).
  useEffect(() => setTerm(searchParams.get('search') || ''), [searchParams]);

  /*
   * Publishes the header's height and the page gutter, so anything else that
   * sticks can sit directly beneath it and span the same width.
   *
   * Both are measured rather than written down. The header wraps onto two rows
   * below 860px and grows from 71px to 161px, so a constant offset would be
   * right on a laptop and leave a ninety-pixel gap on a phone.
   *
   * The gutter needs measuring for a subtler reason: `--gutter` is
   * `max(18px, (100% - 1240px) / 2)`, and a percentage in a custom property
   * resolves against whoever *uses* it. Inside the content column that is a
   * narrower box than the full width the header sees, so a sticky bar trying
   * to cancel the gutter with a negative margin fell 162px short of the window
   * edge on a wide screen. This header spans the full width, so its own
   * padding is the real figure.
   */
  const headerRef = useRef(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;

    const publish = () => {
      const root = document.documentElement.style;
      root.setProperty('--topbar-h', `${Math.round(header.getBoundingClientRect().height)}px`);
      root.setProperty('--gutter-px', getComputedStyle(header).paddingLeft);
    };

    publish();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publish);
      return () => window.removeEventListener('resize', publish);
    }

    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (term.trim()) next.set('search', term.trim());
    else next.delete('search');
    next.delete('page');
    navigate(`/shop?${next.toString()}`);
  };

  return (
    <header className="topbar" ref={headerRef}>
      <Link to="/" aria-label="Fresh Meat Nepal — home">
        <Logo />
      </Link>

      <nav className="nav-links">
        {NAV.map((item) =>
          item.hash ? (
            <Link key={item.to} to={item.to}>{item.label}</Link>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="topbar-actions">
        <form className="search" onSubmit={submit} role="search">
          <SearchIcon width={17} height={17} />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search"
            aria-label="Search products"
          />
        </form>

        <Link className="cta-order" to="/shop">
          <span className="puck"><WhatsAppIcon width={15} height={15} /></span>
          Order Fresh Meat
        </Link>

        <NavLink to="/favourites" className={({ isActive }) => `top-action ${isActive ? 'active' : ''}`}>
          <HeartIcon width={20} height={20} filled={ids.length > 0} />
          <span className="label">Favourites</span>
        </NavLink>

        <NavLink to="/cart" className={({ isActive }) => `top-action ${isActive ? 'active' : ''}`}>
          <CartIcon width={20} height={20} />
          {itemCount > 0 && <span className="count-badge">{itemCount}</span>}
          <span className="label">Cart</span>
        </NavLink>

        <ThemeToggle />

        {isAuthenticated ? (
          <AccountMenu />
        ) : (
          <Link className="btn sm" to="/login">Sign in</Link>
        )}
      </div>
    </header>
  );
}
