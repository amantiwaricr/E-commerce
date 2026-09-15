import { useEffect, useMemo, useState } from 'react';
import { formatNpr } from '../../utils/format';

/** Smooths the histogram into a filled area path, as in the reference. */
const buildAreaPath = (values, width, height) => {
  if (!values.length) return '';
  const peak = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => [i * step, height - (v / peak) * (height - 4) - 2]);

  let d = `M 0 ${height} L ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const mid = (x1 + x2) / 2;
    d += ` C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }
  return `${d} L ${width} ${height} Z`;
};

/**
 * Dual-handle price filter over a distribution chart. Two stacked range inputs
 * give real keyboard and touch support; the visible rail is drawn beneath them.
 */
export default function PriceRangeFilter({ bounds, average, histogram = [], value, onChange, onReset }) {
  const { min = 0, max = 0 } = bounds || {};
  const [local, setLocal] = useState({ from: value.from ?? min, to: value.to ?? max });

  // Follow external resets and newly loaded bounds.
  useEffect(() => {
    setLocal({ from: value.from ?? min, to: value.to ?? max });
  }, [value.from, value.to, min, max]);

  const path = useMemo(() => buildAreaPath(histogram, 220, 52), [histogram]);
  const span = Math.max(1, max - min);
  const pct = (n) => ((n - min) / span) * 100;

  const commit = (next) => {
    setLocal(next);
    onChange(next);
  };

  const setFrom = (raw) => {
    const from = Math.min(Number(raw), local.to - 1);
    commit({ ...local, from: Math.max(min, from) });
  };

  const setTo = (raw) => {
    const to = Math.max(Number(raw), local.from + 1);
    commit({ ...local, to: Math.min(max, to) });
  };

  if (max <= min) return null;

  return (
    <section className="filter-card">
      <div className="spread">
        <h3>Price Range</h3>
        <button type="button" className="filter-reset" onClick={onReset}>Reset</button>
      </div>
      <p className="price-hint">The average price is {formatNpr(average)}</p>

      <svg className="histogram" viewBox="0 0 220 52" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="priceFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={path} fill="url(#priceFade)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>

      <div className="range-wrap">
        <div className="range-bubbles">
          <span className="range-bubble" style={{ left: `${Math.max(9, Math.min(91, pct(local.from)))}%` }}>
            {formatNpr(local.from)}
          </span>
          <span className="range-bubble" style={{ left: `${Math.max(9, Math.min(91, pct(local.to)))}%` }}>
            {formatNpr(local.to)}
          </span>
        </div>

        <div className="range-track">
          <span className="range-rail" />
          <span
            className="range-fill"
            style={{ left: `${pct(local.from)}%`, width: `${pct(local.to) - pct(local.from)}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            value={local.from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Minimum price"
          />
          <input
            type="range"
            min={min}
            max={max}
            value={local.to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Maximum price"
          />
        </div>
      </div>
    </section>
  );
}
