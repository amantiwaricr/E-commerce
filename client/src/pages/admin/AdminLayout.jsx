import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/users', label: 'Customers' },
];

export default function AdminLayout() {
  return (
    <div className="container admin-layout">
      <nav className="admin-nav" aria-label="Admin sections">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div>
        <Outlet />
      </div>
    </div>
  );
}
