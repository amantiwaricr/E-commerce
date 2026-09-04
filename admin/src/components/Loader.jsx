export default function Loader({ label = 'Loading…' }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="spinner" />
      <p className="small muted" style={{ marginTop: 12 }}>{label}</p>
    </div>
  );
}
