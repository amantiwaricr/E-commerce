/**
 * Weekday × time-slot grid of order volume.
 *
 * Cells are tinted by intensity; the busiest cells are called out as a dark
 * chip carrying the count, so the peak is readable without a legend.
 */
export default function Heatmap({ days = [], slots = [], peak = 0 }) {
  const intensity = (count) => {
    if (!peak || !count) return 0;
    return Math.min(4, Math.ceil((count / peak) * 4));
  };

  return (
    <div className="heatmap">
      <div className="hm-row hm-head">
        <span />
        {days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {slots.map((slot) => (
        <div className="hm-row" key={slot.label}>
          <span className="hm-slot">{slot.label}</span>
          {slot.cells.map((count, index) => {
            const level = intensity(count);
            const isPeak = peak > 0 && count === peak;
            return (
              <span
                key={days[index]}
                className={`hm-cell lv-${level} ${isPeak ? 'peak' : ''}`}
                title={`${days[index]} ${slot.label}: ${count} order${count === 1 ? '' : 's'}`}
              >
                {isPeak ? count : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
