import Stars from '../Stars';

const THRESHOLD = 4;

/**
 * A single "4 Stars & up" toggle, matching the reference. Clicking it again
 * clears the filter.
 */
export default function StarRatingFilter({ options = [], value, onChange }) {
  const on = Number(value) === THRESHOLD;
  const count = options.find((o) => o.stars === THRESHOLD)?.count;

  return (
    <section className="filter-card">
      <h3>Star Rating</h3>
      <button
        type="button"
        className={`rating-row ${on ? 'active' : ''}`}
        onClick={() => onChange(on ? '' : THRESHOLD)}
        aria-pressed={on}
      >
        <Stars value={THRESHOLD} />
        <span className="label">
          {THRESHOLD} Stars &amp; up{count ? ` (${count})` : ''}
        </span>
      </button>
    </section>
  );
}
