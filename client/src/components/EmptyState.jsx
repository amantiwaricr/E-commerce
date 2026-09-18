import { Link } from 'react-router-dom';

/**
 * The action is a link when it goes somewhere and a button when it changes
 * something in place — clearing a filter is not a navigation, and rendering it
 * as a link would put a dead href in the page.
 */
export default function EmptyState({ title, message, actionLabel, actionTo, onAction }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}

      {actionLabel && actionTo && (
        <Link className="btn" to={actionTo} style={{ marginTop: 12 }}>
          {actionLabel}
        </Link>
      )}

      {actionLabel && !actionTo && onAction && (
        <button type="button" className="btn" onClick={onAction} style={{ marginTop: 12 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
