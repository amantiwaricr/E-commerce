import { Outlet, useLocation } from 'react-router-dom';
import UtilityBar from './UtilityBar';
import TopBar from './TopBar';
import SiteFooter from './SiteFooter';

/** The shop chrome: everything except the landing page, which brings its own. */
export default function ShopLayout() {
  // The landing page's bands run edge to edge, so it opts out of the gutter
  // and re-applies the width inside its own `.wrap`.
  const bleed = useLocation().pathname === '/';

  return (
    <div className="viewport">
      <div className="shell">
        <UtilityBar />
        <TopBar />
        <div className={`shell-body ${bleed ? 'bleed' : ''}`}>
          <Outlet />
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}
