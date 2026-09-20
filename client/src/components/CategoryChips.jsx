import { useEffect, useRef } from 'react';
import { CATEGORIES } from '../config';

/** Horizontal category rail. "All Categories" clears the filter. */
export default function CategoryChips({ value, onChange }) {
  /*
   * Publishes the rail's height as --chips-h, so the filter sidebar can pin
   * itself below both this and the header. Measured for the same reason the
   * header's height is: the rail wraps taller on narrow screens, and a
   * constant would be wrong at exactly the widths where the gap shows.
   *
   * Cleared on unmount so a stale height cannot outlive the only page that
   * renders this.
   */
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const publish = () =>
      document.documentElement.style.setProperty('--chips-h', `${Math.round(rail.getBoundingClientRect().height)}px`);

    publish();
    const stop = () => document.documentElement.style.removeProperty('--chips-h');

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publish);
      return () => {
        window.removeEventListener('resize', publish);
        stop();
      };
    }

    const observer = new ResizeObserver(publish);
    observer.observe(rail);
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);

  return (
    <nav className="chips" aria-label="Product categories" ref={railRef}>
      <button type="button" className={`chip ${!value ? 'active' : ''}`} onClick={() => onChange('')}>
        All Categories
      </button>
      {CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className={`chip ${value === category ? 'active' : ''}`}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </nav>
  );
}
