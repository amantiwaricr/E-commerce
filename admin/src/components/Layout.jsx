import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import Mark from './Mark';
import Icon from './Icon';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { STORE_NAME, STOREFRONT_URL } from '../config';

const GROUPS = [
  {
    label: 'Overview',
    links: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    label: 'Manage',
    links: [
      { to: '/products', label: 'Products', icon: 'box' },
      { to: '/orders', label: 'Orders', icon: 'receipt' },
      { to: '/users', label: 'Customers', icon: 'users' },
    ],
  },
];

const ORDER_NUMBER = /^FMN-\d{4}-\d{5}$/i;
const STATS_REFRESH_MS = 120000;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [stats, setStats] = useState(null);

  // Powers the sidebar tallies and the low-stock bell.
  useEffect(() => {
    let cancelled = false;
    const read = () =>
      api
        .get('/admin/stats')
        .then(({ data }) => {
          if (!cancelled) setStats(data.stats);
        })
        .catch(() => {});

    read();
    const timer = setInterval(read, STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  /** An order number jumps straight to that order; anything else searches products. */
  const handleSearch = (event) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    navigate(ORDER_NUMBER.test(query) ? `/orders/${query.toUpperCase()}` : `/products?search=${encodeURIComponent(query)}`);
    setTerm('');
  };

  const lowStock = stats?.lowStockProducts || 0;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Mark />
          <span>
            {STORE_NAME}
            <small>ADMIN</small>
          </span>
        </div>

        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            <nav onClick={() => setOpen(false)}>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  <Icon name={link.icon} size={17} />
                  {link.label}
                  {link.to === '/orders' && stats?.pendingOrders > 0 && <span className="tally">{stats.pendingOrders}</span>}
                  {link.to === '/products' && lowStock > 0 && <span className="tally">{lowStock}</span>}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}

        <div className="foot">
          <a href={STOREFRONT_URL} target="_blank" rel="noreferrer">
            <Icon name="store" size={15} /> View storefront
          </a>
        </div>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="admin-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            <Icon name="menu" size={17} />
          </button>

          <form className="search" onSubmit={handleSearch} role="search">
            <Icon name="search" size={16} />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search products, or paste an order number"
              aria-label="Search the store"
            />
          </form>

          <div className="who">
            <NavLink className="icon-btn" to="/products" aria-label={`${lowStock} products low on stock`} title="Low stock">
              <Icon name="bell" size={16} />
              {lowStock > 0 && <span className="dot">{lowStock > 9 ? '9+' : lowStock}</span>}
            </NavLink>

            {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="initial">{initial}</span>}
            <div className="who-name">
              <strong>{user?.name}</strong>
              <div className="small muted">{user?.email}</div>
            </div>
            <button type="button" className="icon-btn" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
