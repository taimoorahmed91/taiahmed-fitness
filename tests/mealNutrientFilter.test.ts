import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesNutrientFilter, normalizeNutrientInput, validNutrientInput } from '../src/lib/mealNutrientFilter';

const expect = (actual: unknown) => ({
  toBe: (expected: unknown) => assert.strictEqual(actual, expected),
  toEqual: (expected: unknown) => assert.deepStrictEqual(actual, expected),
});

describe('meal nutrient filtering', () => {
  test('calorie ranges include both bounds', () => {
    const filter = { mode: 'range' as const, min: '200', max: '500' };
    expect([199, 200, 350, 500, 501].filter(v => matchesNutrientFilter(v, filter))).toEqual([200, 350, 500]);
  });
  test('exact protein values match decimals, not nearby values', () => {
    const filter = { mode: 'exact' as const, min: '25.5', max: '100' };
    expect(matchesNutrientFilter(25.5, filter)).toBe(true);
    expect(matchesNutrientFilter(25, filter)).toBe(false);
  });
  test('carb ranges can be open at either end', () => {
    expect(matchesNutrientFilter(20, { mode: 'range', min: '', max: '30' })).toBe(true);
    expect(matchesNutrientFilter(31, { mode: 'range', min: '', max: '30' })).toBe(false);
    expect(matchesNutrientFilter(40, { mode: 'range', min: '30', max: '' })).toBe(true);
    expect(matchesNutrientFilter(20, { mode: 'range', min: '30', max: '' })).toBe(false);
  });
  test('missing macros are not treated as zero when filtered', () => {
    expect(matchesNutrientFilter(null, { mode: 'exact', min: '0', max: '' })).toBe(false);
    expect(matchesNutrientFilter(0, { mode: 'exact', min: '0', max: '' })).toBe(true);
    expect(matchesNutrientFilter(null, { mode: 'range', min: '', max: '' })).toBe(true);
  });
  test('reversed ranges return no matches', () => {
    expect(matchesNutrientFilter(25, { mode: 'range', min: '30', max: '20' })).toBe(false);
  });
  test('decimal commas normalize and invalid numeric input is rejected', () => {
    expect(normalizeNutrientInput('25,5')).toBe('25.5');
    expect(validNutrientInput('25.5')).toBe(true);
    expect(validNutrientInput('-1')).toBe(false);
    expect(validNutrientInput('1.2.3')).toBe(false);
  });
});