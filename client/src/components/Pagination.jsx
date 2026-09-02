export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn secondary sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span className="small muted">
        Page {page} of {pages}
      </span>
      <button type="button" className="btn secondary sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>
        Next
      </button>
    </nav>
  );
}
