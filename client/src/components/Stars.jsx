import { StarIcon } from './icons';

/** Five stars with `value` of them lit — rounded to the nearest whole star. */
export default function Stars({ value = 0, size = 15 }) {
  const lit = Math.round(value);
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} width={size} height={size} className={n <= lit ? 'star-on' : 'star-off'} />
      ))}
    </span>
  );
}
