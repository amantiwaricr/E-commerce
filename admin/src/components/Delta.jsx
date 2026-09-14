import Icon from './Icon';

/** Period-on-period change pill — green when up, red when down, grey at zero. */
export default function Delta({ value = 0, suffix = '%' }) {
  const rounded = Math.round(Math.abs(Number(value) || 0) * 10) / 10;
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span className={`delta ${direction}`}>
      {direction !== 'flat' && <Icon name={direction === 'up' ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2.4} />}
      {rounded}
      {suffix}
    </span>
  );
}
