import { CATEGORIES } from '../config';

/** Horizontal category rail. "All Categories" clears the filter. */
export default function CategoryChips({ value, onChange }) {
  return (
    <nav className="chips" aria-label="Product categories">
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
