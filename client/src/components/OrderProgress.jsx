import { ORDER_STATUS_FLOW } from '../config';
import { CheckIcon } from './icons';

const STEP_LABELS = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  processing: 'Prepared',
  shipped: 'On the way',
  delivered: 'Delivered',
};

/**
 * The delivery journey as a horizontal rail.
 *
 * The vertical OrderTimeline on the detail page gives each step its timestamp
 * and note; in a list the question is only "how far along is this one?", which
 * a rail answers at a glance across several orders at once.
 *
 * A cancelled order is not a shorter version of this — it left the flow — so it
 * gets its own single-line treatment rather than a rail stopped part way.
 */
export default function OrderProgress({ order }) {
  if (order.orderStatus === 'cancelled') {
    return (
      <div className="oprog cancelled">
        <span className="oprog-dot" aria-hidden="true" />
        <span>Cancelled{order.cancelledReason ? ` — ${order.cancelledReason}` : ''}</span>
      </div>
    );
  }

  const current = ORDER_STATUS_FLOW.indexOf(order.orderStatus);
  // Fill up to the current mark and no further: a segment drawn past it would
  // claim the next step had started. Unitless, because the stylesheet
  // multiplies a length by it.
  const fill = current <= 0 ? 0 : current / (ORDER_STATUS_FLOW.length - 1);

  return (
    <ol
      className="oprog"
      style={{ '--oprog-fill': fill, '--oprog-steps': ORDER_STATUS_FLOW.length }}
    >
      {ORDER_STATUS_FLOW.map((status, index) => {
        const done = index < current;
        const isCurrent = index === current;

        return (
          <li key={status} className={done ? 'done' : isCurrent ? 'current' : ''}>
            <span className="oprog-mark" aria-hidden="true">
              {done ? <CheckIcon width={11} height={11} /> : null}
            </span>
            <span className="oprog-label">{STEP_LABELS[status]}</span>
            {isCurrent && <span className="sr-only">(current step)</span>}
          </li>
        );
      })}
    </ol>
  );
}
