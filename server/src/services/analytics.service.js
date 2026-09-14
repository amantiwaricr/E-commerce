'use strict';

/**
 * Pure shaping helpers behind the admin dashboard.
 *
 * Everything here takes plain aggregation rows and returns render-ready
 * structures, so the maths can be tested without a database.
 */

// Reports read in the store's local time, not UTC — a 10pm Kathmandu order
// belongs to that day, not to the next one.
const REPORT_TIMEZONE = 'Asia/Kathmandu';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// $dayOfWeek is 1-based starting on Sunday.
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HEATMAP_SLOTS = [
  { label: '06:00 – 09:00', from: 6, to: 9 },
  { label: '09:00 – 12:00', from: 9, to: 12 },
  { label: '12:00 – 15:00', from: 12, to: 15 },
  { label: '15:00 – 18:00', from: 15, to: 18 },
  { label: '18:00 – 21:00', from: 18, to: 21 },
  { label: '21:00 – 06:00', from: 21, to: 6 },
];

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };

// Channels are inferred from how the order was paid for — the closest thing the
// store actually records to a sales channel.
const CHANNELS = [
  { key: 'esewa', label: 'eSewa wallet' },
  { key: 'card', label: 'Card payment' },
  { key: 'cod', label: 'Cash on delivery' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/**
 * Percentage change between two periods. A previous period of zero has no
 * meaningful ratio, so growth is reported as a full 100% gain (or flat).
 */
const growth = (current, previous) => {
  const now = Number(current) || 0;
  const before = Number(previous) || 0;
  if (!before) return now > 0 ? 100 : 0;
  return round(((now - before) / before) * 100);
};

/**
 * Rolling window for a period plus the window of equal length immediately
 * before it, which is what every "vs last period" delta compares against.
 */
const periodRange = (period, now = new Date()) => {
  const key = PERIODS.includes(period) ? period : 'monthly';
  const days = PERIOD_DAYS[key];
  const end = new Date(now);
  const start = new Date(end.getTime() - days * DAY_MS);
  const previousEnd = new Date(start);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  return { period: key, days, start, end, previousStart, previousEnd };
};

/**
 * Targets are derived, never invented: each month aims at the trailing
 * three-month average lifted by a 10% growth goal. The first month with data
 * has no history to average, so it targets itself.
 */
const TARGET_GROWTH = 1.1;
const TRAILING_MONTHS = 3;

const withTargets = (series) => {
  const history = [];
  return series.map((point) => {
    const window = history.slice(-TRAILING_MONTHS);
    const average = window.length ? window.reduce((sum, v) => sum + v, 0) / window.length : point.revenue;
    if (point.revenue > 0 || history.length) history.push(point.revenue);
    // Whole rupees — a target with paisa in it reads like a measurement.
    return { ...point, target: round(average * TARGET_GROWTH, 0) };
  });
};

/**
 * Twelve months of revenue for one year, with empty months filled in so the
 * chart keeps an even x-axis.
 * @param rows aggregation rows shaped `{ _id: <1-12>, revenue, orders }`
 */
const buildSalesSeries = (rows = [], year = new Date().getFullYear()) => {
  const byMonth = new Map(rows.map((row) => [Number(row._id), row]));
  const series = MONTH_LABELS.map((label, index) => {
    const row = byMonth.get(index + 1);
    return {
      month: index + 1,
      label,
      revenue: round(row?.revenue || 0, 2),
      orders: row?.orders || 0,
    };
  });
  return { year, points: withTargets(series) };
};

/**
 * Sales split by channel for the current period, each with its own delta
 * against the previous one.
 */
const buildChannels = (currentRows = [], previousRows = []) => {
  const previous = new Map(previousRows.map((row) => [row._id, row]));
  const channels = CHANNELS.map(({ key, label }) => {
    const row = currentRows.find((item) => item._id === key);
    const revenue = round(row?.revenue || 0, 2);
    return {
      key,
      label,
      revenue,
      orders: row?.orders || 0,
      units: round(row?.units || 0, 2),
      change: growth(revenue, previous.get(key)?.revenue || 0),
    };
  });

  const totalUnits = round(channels.reduce((sum, c) => sum + c.units, 0), 2);
  const totalRevenue = round(channels.reduce((sum, c) => sum + c.revenue, 0), 2);

  return {
    channels: channels.map((channel) => ({
      ...channel,
      share: totalRevenue ? round((channel.revenue / totalRevenue) * 100) : 0,
    })),
    totalUnits,
    totalRevenue,
    totalOrders: channels.reduce((sum, c) => sum + c.orders, 0),
  };
};

/**
 * Best sellers for the period, ranked by units moved.
 * @param rows rows shaped `{ _id: { slug, name, image, unit }, units, revenue }`
 */
const buildTopProducts = (rows = [], limit = 3) => {
  const ranked = rows
    .map((row) => ({
      slug: row._id?.slug || '',
      name: row._id?.name || 'Unknown product',
      image: row._id?.image || '',
      unit: row._id?.unit || 'kg',
      units: round(row.units || 0, 2),
      revenue: round(row.revenue || 0, 2),
      orders: row.orders || 0,
    }))
    .sort((a, b) => b.units - a.units);

  return {
    products: ranked.slice(0, limit),
    totalUnits: round(ranked.reduce((sum, row) => sum + row.units, 0), 2),
  };
};

const slotForHour = (hour) =>
  HEATMAP_SLOTS.findIndex(({ from, to }) => (from < to ? hour >= from && hour < to : hour >= from || hour < to));

/**
 * When orders actually land, as a weekday × time-slot grid.
 * @param rows rows shaped `{ _id: { day: <1-7>, hour: <0-23> }, count }`
 */
const buildOrderHeatmap = (rows = []) => {
  const grid = HEATMAP_SLOTS.map(({ label }) => ({ label, cells: DAY_LABELS.map(() => 0) }));

  rows.forEach((row) => {
    const dayIndex = Number(row._id?.day) - 1;
    const slotIndex = slotForHour(Number(row._id?.hour));
    if (dayIndex < 0 || dayIndex > 6 || slotIndex < 0) return;
    grid[slotIndex].cells[dayIndex] += row.count || 0;
  });

  const peak = grid.reduce((max, slot) => Math.max(max, ...slot.cells), 0);
  let busiest = null;
  if (peak > 0) {
    grid.some((slot) => {
      const dayIndex = slot.cells.indexOf(peak);
      if (dayIndex === -1) return false;
      busiest = { day: DAY_LABELS[dayIndex], slot: slot.label, count: peak };
      return true;
    });
  }

  return { days: DAY_LABELS, slots: grid, peak, busiest };
};

module.exports = {
  REPORT_TIMEZONE,
  MONTH_LABELS,
  DAY_LABELS,
  HEATMAP_SLOTS,
  PERIODS,
  PERIOD_DAYS,
  CHANNELS,
  round,
  growth,
  periodRange,
  buildSalesSeries,
  buildChannels,
  buildTopProducts,
  buildOrderHeatmap,
  slotForHour,
};
