import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { getMealDate, getMealTime, getMealDateTimeBasis } from '../src/lib/mealDateTime';

describe('meal date/time basis', () => {
  test('date is the UTC day and matches the legacy toISOString expression', () => {
    const now = new Date('2026-03-04T10:15:00Z');
    assert.equal(getMealDate(now), '2026-03-04');
    assert.equal(getMealDate(now), now.toISOString().split('T')[0]);
  });

  test('UTC midnight boundary flips the date exactly at 00:00:00Z', () => {
    assert.equal(getMealDate(new Date('2026-06-01T23:59:59.999Z')), '2026-06-01');
    assert.equal(getMealDate(new Date('2026-06-02T00:00:00.000Z')), '2026-06-02');
  });

  test('Europe/Warsaw shortly after local midnight (summer, CEST): UTC date is still the previous day', () => {
    // 2026-06-02 00:30 in Warsaw is 2026-06-01 22:30 UTC.
    const now = new Date('2026-06-01T22:30:00Z');
    assert.deepEqual(getMealDateTimeBasis(now, 'Europe/Warsaw'), { date: '2026-06-01', time: '00:30' });
  });

  test('Europe/Warsaw shortly after local midnight (winter, CET)', () => {
    // 2026-01-15 00:10 in Warsaw is 2026-01-14 23:10 UTC.
    const now = new Date('2026-01-14T23:10:00Z');
    assert.deepEqual(getMealDateTimeBasis(now, 'Europe/Warsaw'), { date: '2026-01-14', time: '00:10' });
  });

  test('Europe/Warsaw after UTC midnight has caught up to the same local and UTC day', () => {
    const now = new Date('2026-06-02T00:05:00Z'); // 02:05 in Warsaw
    assert.deepEqual(getMealDateTimeBasis(now, 'Europe/Warsaw'), { date: '2026-06-02', time: '02:05' });
  });

  test('midnight renders as 00:00, never 24:00, and is zero padded', () => {
    assert.equal(getMealTime(new Date('2026-06-01T22:00:00Z'), 'Europe/Warsaw'), '00:00');
    assert.equal(getMealTime(new Date('2026-06-01T07:05:00Z'), 'UTC'), '07:05');
  });

  test('default time zone still returns HH:mm', () => {
    assert.match(getMealTime(new Date()), /^([01]\d|2[0-3]):[0-5]\d$/);
  });
});
