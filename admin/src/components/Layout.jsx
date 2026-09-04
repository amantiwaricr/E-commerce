import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Mark from './Mark';
import { useAuth } from '../context/AuthContext';
import { STORE_NAME, STOREFRONT_URL } from '../config';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true },
  { to: '/products', label: 'Products', icon: '▣' },
  { to: '/orders', label: 'Orders', icon: '⛬' },
  { to: '/users', label: 'Customers', icon: '☻' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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

        <nav onClick={() => setOpen(false)}>
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              <span className="ico" aria-hidden="true">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="foot">
          <a href={STOREFRONT_URL} target="_blank" rel="noreferrer">View storefront ↗</a>
        </div>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="admin-main">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            ☰
          </button>

          <div className="who">
            {user?.avatar && <img src={user.avatar} alt="" />}
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.name}</div>
              <div className="small muted">{user?.email}</div>
            </div>
            <button type="button" className="btn secondary sm" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
