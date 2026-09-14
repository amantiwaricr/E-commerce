/**
 * Thin stroke icons drawn on a 24×24 grid.
 *
 * Inline SVG rather than an icon font or a package: the whole set is a few
 * hundred bytes, inherits `currentColor`, and never flashes on first paint.
 */
const PATHS = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  box: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 6h6M9 12h6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  gauge: 'M12 21a9 9 0 1 0-9-9m9 9a9 9 0 0 0 9-9m-9 9V12m0 0 5-5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search: 'm21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  arrowUpRight: 'M7 17 17 7m0 0H8m9 0v9',
  arrowUp: 'm12 19V5m0 0-7 7m7-7 7 7',
  arrowDown: 'M12 5v14m0 0 7-7m-7 7-7-7',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5m0 0-5-5m5 5H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  store: 'M3 9h18l-1.5-5h-15L3 9Zm0 0v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M9 20v-6h6v6',
  tag: 'M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
};

export default function Icon({ name, size = 18, strokeWidth = 1.6, ...rest }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
