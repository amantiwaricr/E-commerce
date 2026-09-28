import { useId, useState } from 'react';
import { StarIcon } from './icons';

export const RATING_WORDS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

/**
 * Five stars to choose a rating from. Built on real radio buttons, so arrow
 * keys, screen readers and form semantics all work; the stars are only the
 * picture of them.
 */
export default function StarPicker({ value, onChange, disabled = false }) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <fieldset className="star-picker" disabled={disabled} onMouseLeave={() => setHover(0)}>
      <legend className="sr-only">Your rating</legend>
      <div className="star-picker-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
            />
            <StarIcon width={30} height={30} filled={n <= shown} />
            <span className="sr-only">
              {n} star{n === 1 ? '' : 's'}, {RATING_WORDS[n]}
            </span>
          </label>
        ))}
      </div>
      <span className="star-picker-word" aria-hidden="true">
        {shown ? RATING_WORDS[shown] : 'Tap a star to rate'}
      </span>
    </fieldset>
  );
}
