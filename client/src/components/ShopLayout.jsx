import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import SiteFooter from './SiteFooter';

/** The shop chrome: everything except the landing page, which brings its own. */
export default function ShopLayout() {
  return (
    <div className="viewport">
      <div className="shell">
        <TopBar />
        <div className="shell-body">
          <Outlet />
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}
