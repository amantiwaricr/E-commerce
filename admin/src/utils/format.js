export const formatNpr = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const formatDay = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const titleCase = (value) => String(value || '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Compact money for chart axes: Rs 1.2L / Rs 45k / Rs 900. */
export const formatCompact = (value) => {
  const amount = Number(value) || 0;
  if (amount >= 10000000) return `${Math.round(amount / 100000) / 10}Cr`;
  if (amount >= 100000) return `${Math.round(amount / 10000) / 10}L`;
  if (amount >= 1000) return `${Math.round(amount / 100) / 10}k`;
  return String(Math.round(amount));
};

/**
 * "5 minutes ago", or "5m" in compact form for the tight activity feed.
 *
 * Each unit is computed from the elapsed time directly. The earlier version
 * divided step by step and labelled every step with the previous unit, so an
 * order placed ten days ago read "1 day ago".
 */
const DAY_SECONDS = 86400;
const AGO_UNITS = [
  // [largest age in seconds for this unit, seconds per unit, name, compact]
  [3600, 60, 'minute', 'm'],
  [DAY_SECONDS, 3600, 'hour', 'h'],
  [7 * DAY_SECONDS, DAY_SECONDS, 'day', 'd'],
  [30 * DAY_SECONDS, 7 * DAY_SECONDS, 'week', 'w'],
  [365 * DAY_SECONDS, 30.44 * DAY_SECONDS, 'month', 'mo'],
  [Infinity, 365.25 * DAY_SECONDS, 'year', 'y'],
];

export const timeAgo = (value, compact = false) => {
  if (!value) return '—';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '—';
  if (seconds < 60) return compact ? 'now' : 'just now';
  const [, size, name, short] = AGO_UNITS.find(([limit]) => seconds < limit);
  const whole = Math.max(1, Math.floor(seconds / size));
  if (compact) return `${whole}${short}`;
  return `${whole} ${name}${whole === 1 ? '' : 's'} ago`;
};
