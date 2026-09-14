/** Single-source icon set — stroke icons sized by the parent's font/box. */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  'aria-hidden': true,
};

export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);

export const BoxIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" />
  </svg>
);

export const HeartIcon = ({ filled = false, ...p }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="M20.3 5.6a5 5 0 0 0-7.1 0L12 6.8l-1.2-1.2a5 5 0 1 0-7.1 7.1l8.3 8.3 8.3-8.3a5 5 0 0 0 0-7.1z" />
  </svg>
);

export const CartIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
    <path d="M2 3h2.2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h9.3a1.5 1.5 0 0 0 1.5-1.2L21 7H5" />
  </svg>
);

export const StarIcon = ({ filled = true, ...p }) => (
  <svg {...base} strokeWidth={1.4} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
);

export const CheckIcon = (p) => (
  <svg {...base} strokeWidth={3} {...p}><path d="m4.5 12.5 5 5 10-11" /></svg>
);

export const TagIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" />
  </svg>
);

export const SlidersIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" />
  </svg>
);

export const ChevronLeft = (p) => <svg {...base} {...p}><path d="m15 5-7 7 7 7" /></svg>;
export const ChevronRight = (p) => <svg {...base} {...p}><path d="m9 5 7 7-7 7" /></svg>;
