import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { STORE_NAME } from '../config';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const handleLogout = async () => {
    close();
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="container bar" style={{ position: 'relative' }}>
        <Link to="/" className="brand" onClick={close}>
          <Logo />
          {STORE_NAME}
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>

        <nav className={`nav-links ${open ? 'open' : ''}`}>
          <NavLink to="/products" onClick={close}>
            Shop
          </NavLink>

          {isAuthenticated && (
            <NavLink to="/orders" onClick={close}>
              My orders
            </NavLink>
          )}

          <NavLink to="/cart" className="cart-link" onClick={close}>
            Cart
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </NavLink>

          {isAuthenticated ? (
            <>
              <NavLink to="/profile" onClick={close} title={user.email}>
                {user.avatar ? <img className="avatar" src={user.avatar} alt="" /> : user.name.split(' ')[0]}
              </NavLink>
              <button type="button" className="btn secondary sm" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <Link className="btn sm" to="/login" onClick={close}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
