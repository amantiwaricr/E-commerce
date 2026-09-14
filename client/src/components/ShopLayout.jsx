import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import { STORE_NAME } from '../config';

/** The light shop chrome: everything except the dark landing page uses it. */
export default function ShopLayout() {
  return (
    <div className="viewport">
      <div className="shell">
        <TopBar />
        <div className="shell-body">
          <Outlet />
        </div>
        <footer className="site-footer">
          © {new Date().getFullYear()} {STORE_NAME} · Kathmandu, Nepal · eSewa, card &amp; cash on delivery
        </footer>
      </div>
    </div>
  );
}
