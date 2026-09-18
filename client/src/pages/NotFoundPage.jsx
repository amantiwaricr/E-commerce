import EmptyState from '../components/EmptyState';
import useSeo from '../hooks/useSeo';

export default function NotFoundPage() {
  useSeo({
    title: 'Page not found',
    description: 'That page does not exist. Browse the meat market instead.',
    noIndex: true,
  });

  return (
    <div className="container page">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="404 — page not found"
        message="The page you were looking for does not exist."
        actionLabel="Go to the shop"
        actionTo="/shop"
      />
    </div>
  );
}
