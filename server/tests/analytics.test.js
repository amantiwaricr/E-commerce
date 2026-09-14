'use strict';

const {
  growth,
  periodRange,
  buildSalesSeries,
  buildChannels,
  buildTopProducts,
  buildOrderHeatmap,
  slotForHour,
} = require('../src/services/analytics.service');
const { toCsv, escapeCell } = require('../src/utils/csv');
const { buildOrderFilter } = require('../src/controllers/admin.controller');

describe('growth', () => {
  it('reports the percentage change between two periods', () => {
    expect(growth(120, 100)).toBe(20);
    expect(growth(80, 100)).toBe(-20);
    expect(growth(100, 100)).toBe(0);
  });

  it('treats any gain from nothing as a full 100%', () => {
    expect(growth(500, 0)).toBe(100);
    expect(growth(0, 0)).toBe(0);
  });

  it('rounds to one decimal place', () => {
    expect(growth(1013, 1000)).toBe(1.3);
  });
});

describe('periodRange', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('pairs each window with the equal window before it', () => {
    const { start, end, previousStart, previousEnd, days } = periodRange('weekly', now);
    expect(days).toBe(7);
    expect(end).toEqual(now);
    expect(previousEnd).toEqual(start);
    expect(end - start).toBe(start - previousStart);
  });

  it('falls back to the monthly window for anything unknown', () => {
    expect(periodRange('fortnightly', now).period).toBe('monthly');
    expect(periodRange(undefined, now).days).toBe(30);
  });
});

describe('buildSalesSeries', () => {
  it('fills the months with no sales so the axis stays even', () => {
    const { points } = buildSalesSeries([{ _id: 3, revenue: 5000, orders: 4 }], 2026);
    expect(points).toHaveLength(12);
    expect(points[2]).toMatchObject({ label: 'Mar', revenue: 5000, orders: 4 });
    expect(points[0]).toMatchObject({ label: 'Jan', revenue: 0, orders: 0 });
  });

  it('derives each target from the trailing average plus a growth goal', () => {
    const { points } = buildSalesSeries(
      [
        { _id: 1, revenue: 1000, orders: 1 },
        { _id: 2, revenue: 2000, orders: 1 },
        { _id: 3, revenue: 3000, orders: 1 },
      ],
      2026
    );
    // The first month has no history to average, so it targets itself.
    expect(points[0].target).toBe(1100);
    expect(points[1].target).toBe(1100);
    expect(points[2].target).toBe(1650); // avg(1000, 2000) × 1.1
  });
});

describe('buildChannels', () => {
  const current = [
    { _id: 'esewa', revenue: 6000, orders: 3, units: 12 },
    { _id: 'cod', revenue: 4000, orders: 2, units: 8 },
  ];

  it('reports every channel, including ones with no sales', () => {
    const { channels } = buildChannels(current, []);
    expect(channels.map((c) => c.key)).toEqual(['esewa', 'card', 'cod']);
    expect(channels.find((c) => c.key === 'card')).toMatchObject({ revenue: 0, orders: 0, share: 0 });
  });

  it('works out each channel share of the period', () => {
    const { channels, totalRevenue, totalUnits, totalOrders } = buildChannels(current, []);
    expect(totalRevenue).toBe(10000);
    expect(totalUnits).toBe(20);
    expect(totalOrders).toBe(5);
    expect(channels.find((c) => c.key === 'esewa').share).toBe(60);
  });

  it('compares each channel with its own previous period', () => {
    const { channels } = buildChannels(current, [{ _id: 'esewa', revenue: 5000 }]);
    expect(channels.find((c) => c.key === 'esewa').change).toBe(20);
    expect(channels.find((c) => c.key === 'cod').change).toBe(100);
  });
});

describe('buildTopProducts', () => {
  const rows = [
    { _id: { slug: 'b', name: 'Buff Mince', unit: 'kg' }, units: 20, revenue: 14000, orders: 9 },
    { _id: { slug: 'g', name: 'Goat Curry Cut', unit: 'kg' }, units: 45, revenue: 63000, orders: 18 },
    { _id: { slug: 'c', name: 'Chicken', unit: 'kg' }, units: 30, revenue: 21000, orders: 12 },
    { _id: { slug: 'f', name: 'Fish', unit: 'kg' }, units: 5, revenue: 5500, orders: 3 },
  ];

  it('ranks by units sold and keeps only the requested slice', () => {
    const { products } = buildTopProducts(rows, 3);
    expect(products.map((p) => p.slug)).toEqual(['g', 'c', 'b']);
  });

  it('totals every product, not just the ones on show', () => {
    expect(buildTopProducts(rows, 3).totalUnits).toBe(100);
  });

  it('survives rows with nothing sold', () => {
    expect(buildTopProducts([], 3)).toEqual({ products: [], totalUnits: 0 });
  });
});

describe('order heatmap', () => {
  it('puts each hour in its slot, including the overnight wrap', () => {
    expect(slotForHour(7)).toBe(0);
    expect(slotForHour(13)).toBe(2);
    expect(slotForHour(23)).toBe(5);
    expect(slotForHour(3)).toBe(5); // 21:00–06:00 spans midnight
  });

  it('lays orders out as weekday × slot and names the peak', () => {
    const { slots, peak, busiest, days } = buildOrderHeatmap([
      { _id: { day: 2, hour: 10 }, count: 3 },
      { _id: { day: 6, hour: 19 }, count: 7 },
      { _id: { day: 6, hour: 20 }, count: 2 },
    ]);

    expect(days).toHaveLength(7);
    expect(slots).toHaveLength(6);
    // Monday 09:00–12:00
    expect(slots[1].cells[1]).toBe(3);
    // Friday's two evening buckets land in the same slot.
    expect(slots[4].cells[5]).toBe(9);
    expect(peak).toBe(9);
    expect(busiest).toEqual({ day: 'Fri', slot: '18:00 – 21:00', count: 9 });
  });

  it('reports no peak when there are no orders', () => {
    expect(buildOrderHeatmap([]).busiest).toBeNull();
  });

  it('ignores rows outside the grid', () => {
    expect(buildOrderHeatmap([{ _id: { day: 9, hour: 10 }, count: 4 }]).peak).toBe(0);
  });
});

describe('CSV export', () => {
  it('quotes values containing a delimiter, quote or newline', () => {
    expect(escapeCell('plain')).toBe('plain');
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('defuses anything a spreadsheet would run as a formula', () => {
    expect(escapeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCell('+1')).toBe("'+1");
    expect(escapeCell('@cmd')).toBe("'@cmd");
  });

  it('writes a header row and leads with a BOM so Excel reads UTF-8', () => {
    const csv = toCsv([{ name: 'खसी', qty: 2 }], [
      { key: 'name', label: 'Product' },
      { key: 'qty', label: 'Qty' },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Product,Qty\r\n');
    expect(csv).toContain('खसी,2');
  });

  it('accepts a computed column', () => {
    const csv = toCsv([{ items: [{ name: 'Goat', quantity: 2 }] }], [
      { key: 'items', label: 'Items', value: (row) => row.items.map((i) => `${i.quantity} x ${i.name}`).join(' | ') },
    ]);
    expect(csv).toContain('2 x Goat');
  });
});

describe('buildOrderFilter', () => {
  it('ignores filters that were left blank', () => {
    expect(buildOrderFilter({ status: '', paymentMethod: undefined })).toEqual({});
  });

  it('normalises an order number to upper case', () => {
    expect(buildOrderFilter({ orderNumber: ' fmn-2026-00184 ' })).toEqual({ orderNumber: 'FMN-2026-00184' });
  });

  it('drops a date it cannot parse rather than passing Mongo an Invalid Date', () => {
    expect(buildOrderFilter({ from: 'last tuesday' })).toEqual({});
  });

  it('stretches a "to" date to the end of that day', () => {
    const { createdAt } = buildOrderFilter({ to: '2026-09-14' });
    expect(createdAt.$lte.getHours()).toBe(23);
    expect(createdAt.$lte.getMinutes()).toBe(59);
  });
});
