import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** How long Back waits for a page's content to grow tall enough to return to. */
const RESTORE_TIMEOUT_MS = 1500;

/**
 * React Router swaps the page but leaves the window where it was, so a link
 * clicked from the footer opened the next page at its footer too.
 *
 * - A new page (or a link back to the page you are on) starts at the top.
 * - Back and Forward return to where you were on that page. The browser's own
 *   restore runs before a page has loaded its data, so it is done here instead.
 * - A change to the query string alone (filters, tabs, search) keeps your
 *   place, so filtering never throws you back up the page.
 */
export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(location);
  const positions = useRef(new Map());
  const currentKey = useRef(location.key);

  // Remember where each history entry was scrolled to.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    let frame = 0;
    const record = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.current.set(currentKey.current, window.scrollY));
    };
    window.addEventListener('scroll', record, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', record);
    };
  }, []);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = location;
    currentKey.current = location.key;

    if (navigationType === 'POP') {
      const target = positions.current.get(location.key);
      if (target == null) return undefined;
      // Wait for the page to be tall enough to reach its old position.
      const started = performance.now();
      let frame = requestAnimationFrame(function restore() {
        const reachable = document.documentElement.scrollHeight - window.innerHeight >= target;
        if (reachable || performance.now() - started > RESTORE_TIMEOUT_MS) {
          window.scrollTo({ top: target, left: 0, behavior: 'instant' });
          return;
        }
        frame = requestAnimationFrame(restore);
      });
      return () => cancelAnimationFrame(frame);
    }

    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return undefined;
    }

    const onlyQueryChanged = before.pathname === location.pathname && !before.hash && before.search !== location.search;
    if (!onlyQueryChanged) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return undefined;
  }, [location, navigationType]);

  return null;
}
