export default function QuantityStepper({ value, min = 1, max = 99, onChange, disabled = false }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity">
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}
