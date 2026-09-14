/**
 * Segmented radial gauge.
 *
 * Each blade is one slice of the total; consecutive runs are tinted per
 * segment group, so the arc reads as a share breakdown rather than decoration.
 */
const BLADES = 34;
const ARC_START = -102; // degrees, measured from 12 o'clock
const ARC_SWEEP = 204;

const polar = (cx, cy, radius, degrees) => {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
};

export default function GaugeChart({ groups = [], value, label, size = 210 }) {
  const cx = size / 2;
  const cy = size / 2 + 22;
  const inner = size * 0.34;
  const outer = size * 0.47;

  const total = groups.reduce((sum, group) => sum + Math.max(0, group.value || 0), 0);

  // Hand each group a contiguous run of blades proportional to its share, with
  // the rounding error absorbed by the largest group.
  let assigned = 0;
  const runs = groups.map((group, index) => {
    const count =
      index === groups.length - 1
        ? BLADES - assigned
        : Math.round((Math.max(0, group.value || 0) / (total || 1)) * BLADES);
    assigned += count;
    return { ...group, count: Math.max(0, count) };
  });

  const colours = [];
  runs.forEach((run) => {
    for (let i = 0; i < run.count; i += 1) colours.push(run.colour);
  });
  while (colours.length < BLADES) colours.push('var(--chart-empty)');

  return (
    <div className="gauge" style={{ '--gauge-cy': `${cy - size * 0.04}px` }}>
      <svg width={size} height={size * 0.78} role="img" aria-label={`${label}: ${value}`}>
        {Array.from({ length: BLADES }, (_, index) => {
          const angle = ARC_START + (ARC_SWEEP * index) / (BLADES - 1);
          // Blades fan out slightly towards the middle of the arc.
          const lift = Math.sin((index / (BLADES - 1)) * Math.PI) * size * 0.05;
          const [x1, y1] = polar(cx, cy, inner, angle);
          const [x2, y2] = polar(cx, cy, outer + lift, angle);
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colours[index]}
              strokeWidth={size * 0.03}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <div className="gauge-centre">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
