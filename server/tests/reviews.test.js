'use strict';

const {
  summariseRatings, publicName, initialOf, publicReview, eligibility, roundRating,
} = require('../src/utils/reviews');

describe('summariseRatings', () => {
  it('averages whole stars to one decimal and fills the distribution', () => {
    expect(summariseRatings([{ _id: 5, count: 3 }, { _id: 4, count: 1 }, { _id: 1, count: 1 }])).toEqual({
      average: 4, // (15 + 4 + 1) / 5
      count: 5,
      distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 },
    });
    expect(summariseRatings([{ _id: 5, count: 2 }, { _id: 4, count: 1 }]).average).toBe(4.7);
  });

  it('is zero, not NaN, with no reviews', () => {
    expect(summariseRatings([])).toEqual({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });

  it('ignores rows that are not a whole 1–5 star rating', () => {
    const summary = summariseRatings([{ _id: 0, count: 4 }, { _id: 6, count: 2 }, { _id: 3.5, count: 1 }, { _id: null, count: 1 }, { _id: 4, count: 0 }, { _id: 2, count: 1 }]);
    expect(summary).toEqual({ average: 2, count: 1, distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 } });
  });

  it('rounds half-way values up', () => {
    expect(roundRating(4.25)).toBe(4.3);
    expect(roundRating(undefined)).toBe(0);
  });
});

describe('publicName', () => {
  it.each([
    ['Sita Sharma', 'Sita S.'],
    ['sita', 'sita'],
    ['  Ram   Bahadur   thapa ', 'Ram T.'],
    ['', 'Customer'],
    [null, 'Customer'],
    ['sita@example.com', 'Customer'],
  ])('%p is shown as %p', (name, shown) => {
    expect(publicName(name)).toBe(shown);
  });

  it('never carries more than a surname initial', () => {
    expect(publicName('Anjali Gurung')).not.toMatch(/Gurung/);
    expect(initialOf('anjali gurung')).toBe('A');
    expect(initialOf('')).toBe('C');
  });
});

describe('publicReview', () => {
  const base = {
    _id: 'r1', rating: 4, comment: 'Tender', user: { name: 'Sita Sharma', email: 'sita@example.com' },
    createdAt: new Date('2026-09-01T10:00:00Z'),
  };

  it('exposes the author by first name and initial only', () => {
    const shown = publicReview({ ...base, updatedAt: base.createdAt });
    expect(shown).toEqual({ id: 'r1', rating: 4, comment: 'Tender', author: 'Sita S.', createdAt: base.createdAt, edited: false });
    expect(JSON.stringify(shown)).not.toMatch(/example\.com|Sharma/);
  });

  it('marks a review edited only when it changed after the first minute', () => {
    expect(publicReview({ ...base, updatedAt: new Date('2026-09-01T10:00:30Z') }).edited).toBe(false);
    expect(publicReview({ ...base, updatedAt: new Date('2026-09-02T10:00:00Z') }).edited).toBe(true);
  });
});

describe('eligibility', () => {
  it('needs a signed-in customer with a delivered order', () => {
    expect(eligibility({ user: null, deliveredOrderId: 'o1' })).toEqual({ eligible: false, reason: 'signin' });
    expect(eligibility({ user: { role: 'admin' }, deliveredOrderId: 'o1' })).toEqual({ eligible: false, reason: 'admin' });
    expect(eligibility({ user: { role: 'customer' }, deliveredOrderId: null })).toEqual({ eligible: false, reason: 'not-delivered' });
    expect(eligibility({ user: { role: 'customer' }, deliveredOrderId: 'o1' })).toEqual({ eligible: true, reason: '' });
  });
});
