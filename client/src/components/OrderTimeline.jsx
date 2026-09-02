import { ORDER_STATUS_FLOW } from '../config';
import { formatDate, titleCase } from '../utils/format';

const STATUS_COPY = {
  pending: 'Order placed',
  confirmed: 'Order confirmed',
  processing: 'Being prepared',
  shipped: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * Shows the full delivery journey: steps already recorded on the order come with
 * their timestamp and note, the remaining ones are rendered as upcoming.
 */
export default function OrderTimeline({ order }) {
  const events = order.trackingInfo?.timeline || [];
  const cancelled = order.orderStatus === 'cancelled';

  if (cancelled) {
    return (
      <ul className="timeline">
        {events.map((event, index) => (
          <li key={`${event.status}-${index}`} className="done">
            <h4>{STATUS_COPY[event.status] || titleCase(event.status)}</h4>
            <p className="small muted" style={{ margin: 0 }}>
              {formatDate(event.at)}
              {event.note ? ` — ${event.note}` : ''}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.orderStatus);

  return (
    <ul className="timeline">
      {ORDER_STATUS_FLOW.map((status, index) => {
        const event = [...events].reverse().find((e) => e.status === status);
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : '';

        return (
          <li key={status} className={state}>
            <h4 style={{ color: state ? undefined : 'var(--ink-faint)' }}>{STATUS_COPY[status]}</h4>
            <p className="small muted" style={{ margin: 0 }}>
              {event ? formatDate(event.at) : 'Pending'}
              {event?.note ? ` — ${event.note}` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
