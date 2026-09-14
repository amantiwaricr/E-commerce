import { useState } from 'react';
import useMeasure from '../../hooks/useMeasure';

const PADDING = { top: 16, right: 12, bottom: 26, left: 52 };
const HEIGHT = 230;

/** Catmull-Rom control points, which give the series a gentle curve. */
const smoothPath = (points) => {
  if (points.length < 2) return '';
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, '');
};

/**
 * Two-series line chart with a hover readout.
 *
 * Hover is handled by an overlay of transparent columns rather than by
 * measuring pointer coordinates, so keyboard focus lands on the same targets.
 */
export default function LineChart({ points = [], series = [], formatValue = (v) => v, formatTick = (v) => v }) {
  const [ref, width] = useMeasure(680);
  const [active, setActive] = useState(null);

  const plotWidth = Math.max(80, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const values = points.flatMap((point) => series.map((line) => Number(point[line.key]) || 0));
  const max = Math.max(...values, 1);
  // Round the ceiling up to a readable step so the gridline labels stay tidy.
  const step = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max / step) * step || 1;

  const x = (index) => PADDING.left + (points.length === 1 ? plotWidth / 2 : (plotWidth * index) / (points.length - 1));
  const y = (value) => PADDING.top + plotHeight - (Math.max(0, value) / ceiling) * plotHeight;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * ceiling);
  const activePoint = active === null ? null : points[active];

  return (
    <div className="linechart" ref={ref}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Revenue against target">
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--series)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PADDING.left} x2={width - PADDING.right} y1={y(tick)} y2={y(tick)} className="lc-grid" />
            <text x={PADDING.left - 10} y={y(tick) + 4} className="lc-axis" textAnchor="end">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {activePoint && (
          <rect
            x={x(active) - Math.min(22, plotWidth / points.length / 2)}
            y={PADDING.top}
            width={Math.min(44, plotWidth / points.length)}
            height={plotHeight}
            className="lc-band"
            rx="6"
          />
        )}

        {series.map((line) => {
          const coords = points.map((point, index) => ({ x: x(index), y: y(Number(point[line.key]) || 0) }));
          const path = smoothPath(coords);
          return (
            <g key={line.key}>
              {line.area && path && (
                <path d={`${path} L ${x(points.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill="url(#lc-fill)" />
              )}
              <path
                d={path}
                fill="none"
                stroke={line.colour}
                strokeWidth={line.width || 2.5}
                strokeDasharray={line.dashed ? '5 5' : undefined}
                strokeLinecap="round"
              />
              {coords.map((coord, index) => (
                <circle
                  key={index}
                  cx={coord.x}
                  cy={coord.y}
                  r={active === index ? 5 : 3}
                  fill="var(--surface)"
                  stroke={line.colour}
                  strokeWidth="2"
                  opacity={active === null || active === index ? 1 : 0.35}
                />
              ))}
            </g>
          );
        })}

        {points.map((point, index) => (
          <text key={point.label} x={x(index)} y={HEIGHT - 6} className="lc-axis" textAnchor="middle">
            {point.label}
          </text>
        ))}
      </svg>

      <div className="lc-hit" style={{ left: PADDING.left, right: PADDING.right, top: PADDING.top, bottom: PADDING.bottom }}>
        {points.map((point, index) => (
          <button
            key={point.label}
            type="button"
            aria-label={point.label}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
          />
        ))}
      </div>

      {activePoint && (
        <div
          className="lc-tip"
          style={{
            left: `${(x(active) / width) * 100}%`,
            transform: `translate(${x(active) > width * 0.72 ? '-100%' : '-50%'}, 0)`,
          }}
        >
          <strong>{activePoint.tooltipLabel || activePoint.label}</strong>
          {series.map((line) => (
            <span key={line.key}>
              <i style={{ background: line.colour }} />
              {line.label}
              <b>{formatValue(Number(activePoint[line.key]) || 0)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
