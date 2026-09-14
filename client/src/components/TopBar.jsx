import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from './Logo';
import { BoxIcon, CartIcon, HeartIcon, SearchIcon } from './icons';
import AccountMenu from './AccountMenu';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useFavourites } from '../context/FavouritesContext';

export default function TopBar() {
  const { isAuthenticated } = useAuth();
  const { itemCount } = useCart();
  const { ids } = useFavourites();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('search') || '');

  // Keep the box in step when the term changes elsewhere (chips, reset, back).
  useEffect(() => setTerm(searchParams.get('search') || ''), [searchParams]);

  const submit = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (term.trim()) next.set('search', term.trim());
    else next.delete('search');
    next.delete('page');
    navigate(`/shop?${next.toString()}`);
  };

  return (
    <header className="topbar">
      <Link to="/" aria-label="Fresh Meat Nepal — home">
        <Logo />
      </Link>

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

      <div className="topbar-actions">
        <NavLink to="/orders" className={({ isActive }) => `top-action ${isActive ? 'active' : ''}`}>
          <BoxIcon width={19} height={19} />
          <span className="label">Orders</span>
        </NavLink>

        <NavLink to="/favourites" className={({ isActive }) => `top-action ${isActive ? 'active' : ''}`}>
          <HeartIcon width={19} height={19} filled={ids.length > 0} />
          <span className="label">Favourites</span>
        </NavLink>

        <NavLink to="/cart" className={({ isActive }) => `top-action ${isActive ? 'active' : ''}`}>
          <CartIcon width={19} height={19} />
          {itemCount > 0 && <span className="count-badge">{itemCount}</span>}
          <span className="label">Cart</span>
        </NavLink>

        {isAuthenticated ? (
          <AccountMenu />
        ) : (
          <Link className="btn sm" to="/login" style={{ marginLeft: 6 }}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
