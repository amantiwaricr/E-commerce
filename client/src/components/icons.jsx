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

export const LeafIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 8-3 13-9 13z" /><path d="M4 20c2-6 6-9 11-11" />
  </svg>
);

export const UserIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
);

export const PhoneIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M21 16.5v2.8a1.7 1.7 0 0 1-1.9 1.7 16.8 16.8 0 0 1-7.3-2.6 16.5 16.5 0 0 1-5.1-5.1A16.8 16.8 0 0 1 4.1 6a1.7 1.7 0 0 1 1.7-1.9h2.8a1.7 1.7 0 0 1 1.7 1.5c.1.9.3 1.7.6 2.5a1.7 1.7 0 0 1-.4 1.8l-1.2 1.2a13.5 13.5 0 0 0 5.1 5.1l1.2-1.2a1.7 1.7 0 0 1 1.8-.4c.8.3 1.6.5 2.5.6a1.7 1.7 0 0 1 1.5 1.7z" />
  </svg>
);

export const PinIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M20 10.5c0 6-8 11.5-8 11.5s-8-5.5-8-11.5a8 8 0 0 1 16 0z" /><circle cx="12" cy="10.5" r="2.8" />
  </svg>
);

export const GridIcon = (p) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <circle cx="8" cy="8" r=".6" /><circle cx="12" cy="8" r=".6" /><circle cx="16" cy="8" r=".6" />
    <circle cx="8" cy="12" r=".6" /><circle cx="12" cy="12" r=".6" /><circle cx="16" cy="12" r=".6" />
    <circle cx="8" cy="16" r=".6" /><circle cx="12" cy="16" r=".6" /><circle cx="16" cy="16" r=".6" />
  </svg>
);

export const ShieldIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

export const FarmIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9.5 21v-6h5v6" />
  </svg>
);

export const SnowIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><path d="M9.5 4.8 12 7l2.5-2.2M9.5 19.2 12 17l2.5 2.2" />
  </svg>
);

export const ArrowRight = (p) => (
  <svg {...base} {...p}><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></svg>
);
