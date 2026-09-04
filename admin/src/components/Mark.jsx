export default function Mark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#141a24" />
      <path d="M16 42V22h6l10 13 10-13h6v20h-6V32l-10 13-10-13v10z" fill="#e8b04b" />
    </svg>
  );
}
