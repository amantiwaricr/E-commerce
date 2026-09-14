/**
 * Standard delivery or in-store pick-up. The choice is carried through to
 * checkout, where pick-up removes the delivery charge.
 */
export default function DeliveryOptions({ value, onChange }) {
  return (
    <section className="filter-card">
      <h3>Delivery Options</h3>
      <div className="segmented">
        <button type="button" className={value === 'standard' ? 'on' : ''} onClick={() => onChange('standard')}>
          Standard
        </button>
        <button type="button" className={value === 'pickup' ? 'on' : ''} onClick={() => onChange('pickup')}>
          Pick Up
        </button>
      </div>
      <p className="price-hint" style={{ marginTop: 10 }}>
        {value === 'pickup'
          ? 'Collect in store — no delivery charge.'
          : 'Delivered chilled across Kathmandu Valley.'}
      </p>
    </section>
  );
}
