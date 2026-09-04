import { Link } from 'react-router-dom';

export default function EmptyState({ title, message, actionLabel, actionTo }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {actionLabel && actionTo && (
        <Link className="btn" to={actionTo} style={{ marginTop: 12 }}>{actionLabel}</Link>
      )}
    </div>
  );
}
