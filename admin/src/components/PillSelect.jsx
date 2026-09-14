/** Rounded filter control used across the dashboard header rows. */
export default function PillSelect({ value, onChange, options = [], label }) {
  return (
    <label className="pill-select">
      {label && <span className="sr-only">{label}</span>}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
