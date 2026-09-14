/** Round badge mark used on the dark landing page. */
export default function Emblem({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#141811" stroke="#8cc63f" strokeWidth="2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#8cc63f" strokeWidth="1" strokeDasharray="3 3" opacity=".7" />
      <path
        d="M22 38c-3-4-1.5-11 4.5-13.5S38 25 39 29c.7 2.8-.2 5.6-2.3 7.6-2.8 2.7-7 3.4-10.4 2.7-2-.4-3.5-1-4.3-1.3z"
        fill="#8cc63f"
      />
      <circle cx="27" cy="30" r="2.6" fill="#141811" />
    </svg>
  );
}
