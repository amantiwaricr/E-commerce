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
 */
export const timeAgo = (value, compact = false) => {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return compact ? 'now' : 'just now';
  const steps = [
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let amount = seconds / 60;
  let unit = 'minute';
  for (let i = 0; i < steps.length; i += 1) {
    if (amount < steps[i][0]) break;
    amount /= steps[i][0];
    unit = steps[i][1] === 'minute' ? 'hour' : steps[i][1];
  }
  const whole = Math.max(1, Math.floor(amount));
  if (compact) return `${whole}${unit.charAt(0)}`;
  return `${whole} ${unit}${whole === 1 ? '' : 's'} ago`;
};
