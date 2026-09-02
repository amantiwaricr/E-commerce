import EmptyState from '../components/EmptyState';

export default function NotFoundPage() {
  return (
    <div className="container page">
      <EmptyState
        title="404 — page not found"
        message="The page you were looking for does not exist."
        actionLabel="Go to the shop"
        actionTo="/products"
      />
    </div>
  );
}
