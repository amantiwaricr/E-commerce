const ORDER_TONES = {
  pending: 'warn',
  confirmed: 'info',
  processing: 'info',
  shipped: 'brand',
  delivered: 'ok',
  cancelled: 'danger',
};

const PAYMENT_TONES = {
  unpaid: 'warn',
  paid: 'ok',
  failed: 'danger',
  refunded: 'info',
};

export default function StatusBadge({ status, kind = 'order' }) {
  const tone = (kind === 'payment' ? PAYMENT_TONES : ORDER_TONES)[status] || '';
  return <span className={`badge ${tone}`}>{status}</span>;
}
