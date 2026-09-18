'use strict';

const { ACTIVE_STATUSES, statusCondition, summaryFromRows } = require('../src/utils/orderQuery');

describe('statusCondition', () => {
  it('returns null when there is no filter', () => {
    expect(statusCondition(undefined)).toBeNull();
    expect(statusCondition('')).toBeNull();
  });

  it('passes a real status through unchanged', () => {
    expect(statusCondition('delivered')).toBe('delivered');
    expect(statusCondition('cancelled')).toBe('cancelled');
  });

  it('expands `active` into every status still on its way', () => {
    expect(statusCondition('active')).toEqual({ $in: ACTIVE_STATUSES });
    expect(ACTIVE_STATUSES).not.toContain('delivered');
    expect(ACTIVE_STATUSES).not.toContain('cancelled');
  });

  it('ignores a status that does not exist rather than matching nothing silently', () => {
    expect(statusCondition('shippped')).toBeNull();
    expect(statusCondition('admin')).toBeNull();
  });

  /*
   * Express turns ?status[$ne]=delivered into an object. Handed to the query
   * unchanged it would run as an operator — the filter is already pinned to the
   * caller's own orders, so little leaks, but a query operator arriving from a
   * URL is never something to leave working.
   */
  it('refuses an object, so a query operator cannot arrive through the URL', () => {
    expect(statusCondition({ $ne: 'delivered' })).toBeNull();
    expect(statusCondition({ $gt: '' })).toBeNull();
    expect(statusCondition(['delivered'])).toBeNull();
  });
});

describe('summaryFromRows', () => {
  const rows = [
    { _id: 'pending', count: 1, amount: 500 },
    { _id: 'shipped', count: 2, amount: 3000 },
    { _id: 'delivered', count: 4, amount: 12000 },
    { _id: 'cancelled', count: 3, amount: 9000 },
  ];

  it('counts every order, whatever its status', () => {
    expect(summaryFromRows(rows).total).toBe(10);
  });

  it('counts an order as active only while it is still on its way', () => {
    expect(summaryFromRows(rows).active).toBe(3);
  });

  it('leaves cancelled orders out of what was spent', () => {
    expect(summaryFromRows(rows).spent).toBe(15500);
  });

  it('reports zero for a status with no orders instead of undefined', () => {
    const summary = summaryFromRows([{ _id: 'pending', count: 1, amount: 100 }]);
    expect(summary.delivered).toBe(0);
    expect(summary.cancelled).toBe(0);
  });

  it('handles a customer with no orders at all', () => {
    expect(summaryFromRows([])).toEqual({
      byStatus: {}, total: 0, active: 0, delivered: 0, cancelled: 0, spent: 0,
    });
  });
});
