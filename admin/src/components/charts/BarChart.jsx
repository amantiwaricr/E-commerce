import useMeasure from '../../hooks/useMeasure';

const HEIGHT = 210;
const PADDING = { top: 12, right: 8, bottom: 30, left: 38 };

/** Vertical bars with the value set inside the column, as on the reference. */
export default function BarChart({ bars = [], formatTick = (v) => v, emptyLabel = 'No sales in this period yet.' }) {
  const [ref, width] = useMeasure(420);

  if (!bars.length) return <p className="muted small chart-empty">{emptyLabel}</p>;

  const plotWidth = Math.max(60, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const step = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max / step) * step || 1;

  const slot = plotWidth / bars.length;
  const barWidth = Math.min(64, slot * 0.58);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * ceiling);

  return (
    <div className="barchart" ref={ref}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Best selling products">
        <defs>
          <pattern id="bc-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--chart-2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2" opacity="0.55" />
          </pattern>
        </defs>

        {ticks.map((tick) => {
          const ty = PADDING.top + plotHeight - (tick / ceiling) * plotHeight;
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={width - PADDING.right} y1={ty} y2={ty} className="lc-grid" />
              <text x={PADDING.left - 8} y={ty + 4} className="lc-axis" textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {bars.map((bar, index) => {
          const barHeight = Math.max(2, (bar.value / ceiling) * plotHeight);
          const bx = PADDING.left + slot * index + (slot - barWidth) / 2;
          const by = PADDING.top + plotHeight - barHeight;
          const fill = index === 0 ? 'var(--chart-1)' : index === 1 ? 'url(#bc-hatch)' : 'var(--chart-3)';
          return (
            <g key={bar.label}>
              <rect x={bx} y={by} width={barWidth} height={barHeight} rx="8" fill={fill}>
                <title>{`${bar.label}: ${bar.value}`}</title>
              </rect>
              {barHeight > 34 && (
                <text x={bx + barWidth / 2} y={PADDING.top + plotHeight - 12} className={`bc-value ${index === 2 ? 'dark' : ''}`} textAnchor="middle">
                  {bar.value}
                </text>
              )}
              <text x={bx + barWidth / 2} y={HEIGHT - 10} className="lc-axis" textAnchor="middle">
                {bar.label.length > 12 ? `${bar.label.slice(0, 11)}…` : bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
