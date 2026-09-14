import { useState } from 'react';
import { CheckIcon } from '../icons';

const VISIBLE = 6;

/**
 * Multi-select over the catalogue's tags — the cut/type facet that takes the
 * place of a brand list in a meat shop.
 */
export default function TagFilter({ tags = [], value = [], onChange, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tags : tags.slice(0, VISIBLE);

  const toggle = (name) =>
    onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name]);

  if (!tags.length) return null;

  return (
    <section className="filter-card">
      <div className="spread">
        <h3>Cut &amp; Type</h3>
        <button type="button" className="filter-reset" onClick={onReset}>Reset</button>
      </div>

      <ul style={{ marginTop: 8 }}>
        {shown.map(({ name, count }) => {
          const on = value.includes(name);
          return (
            <li key={name}>
              <button type="button" className="check-row" onClick={() => toggle(name)} aria-pressed={on}>
                <span className="swatch" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                <span className="name">{name}</span>
                <span className="count">{count}</span>
                <span className={`tickbox ${on ? 'on' : ''}`}>{on && <CheckIcon />}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {tags.length > VISIBLE && (
        <button type="button" className="link-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'More Types'}
        </button>
      )}
    </section>
  );
}
