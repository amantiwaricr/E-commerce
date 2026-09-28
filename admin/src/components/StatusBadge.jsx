const ORDER_TONES = {
  pending: 'warn',
  confirmed: 'info',
  processing: 'info',
  shipped: 'gold',
  delivered: 'ok',
  // A cancellation is an outcome, not an alarm: kept plain.
  cancelled: '',
};

const PAYMENT_TONES = { unpaid: 'warn', paid: 'ok', failed: 'danger', refunded: 'info' };

export default function StatusBadge({ status, kind = 'order' }) {
  const tone = (kind === 'payment' ? PAYMENT_TONES : ORDER_TONES)[status] || '';
  return <span className={`badge ${tone}`}>{status}</span>;
}
