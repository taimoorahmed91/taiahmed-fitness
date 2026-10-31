import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMealForm, sanitizeNumericInput, type MealFormValues } from '../src/lib/mealForm';

const valid: MealFormValues = { food: ' Chicken salad ', calories: '450', protein: '32,5', carbs: '', time: '12:30', date: '2026-06-01' };

describe('meal form validation', () => {
  test('valid input is trimmed and parsed; empty macros become null; commas become dots', () => {
    const r = validateMealForm(valid);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { food: 'Chicken salad', calories: 450, protein: 32.5, carbs: null, time: '12:30', date: '2026-06-01' });
  });

  test('only food and calories are required; macros are optional', () => {
    const r = validateMealForm({ ...valid, protein: '', carbs: '' });
    assert.equal(r.ok, true);
    const missing = validateMealForm({ ...valid, food: '  ', calories: '' });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.deepEqual(Object.keys(missing.errors).sort(), ['calories', 'food']);
  });

  test('first invalid field follows visual order', () => {
    const r = validateMealForm({ ...valid, calories: 'abc', protein: 'x', time: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.firstInvalid, 'calories');
    const r2 = validateMealForm({ ...valid, food: '', calories: '' });
    if (!r2.ok) assert.equal(r2.firstInvalid, 'food');
  });

  test('calories never silently become 0 or get truncated', () => {
    for (const bad of ['', 'abc', '.', '450.5', '-5', '1e3']) {
      const r = validateMealForm({ ...valid, calories: bad });
      assert.equal(r.ok, false, `calories "${bad}" should be rejected`);
      if (!r.ok) assert.ok(r.errors.calories);
    }
    const zero = validateMealForm({ ...valid, calories: '0' });
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.value.calories, 0);
  });

  test('calories upper bound protects the INTEGER column', () => {
    assert.equal(validateMealForm({ ...valid, calories: '100000' }).ok, true);
    assert.equal(validateMealForm({ ...valid, calories: '100001' }).ok, false);
    assert.equal(validateMealForm({ ...valid, calories: '99999999999999999999' }).ok, false);
  });

  test('macros accept decimals and reject junk instead of dropping to a number', () => {
    const ok = validateMealForm({ ...valid, protein: '.5', carbs: '12.' });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual([ok.value.protein, ok.value.carbs], [0.5, 12]);
    for (const bad of ['12abc', '.', '1.2.3', '-3']) {
      const r = validateMealForm({ ...valid, protein: bad });
      assert.equal(r.ok, false, `protein "${bad}" should be rejected`);
    }
  });

  test('food length is checked after trimming', () => {
    assert.equal(validateMealForm({ ...valid, food: 'a'.repeat(500) }).ok, true);
    assert.equal(validateMealForm({ ...valid, food: 'a'.repeat(501) }).ok, false);
  });

  test('time and date must be real values; stored seconds are tolerated', () => {
    assert.equal(validateMealForm({ ...valid, time: '' }).ok, false);
    assert.equal(validateMealForm({ ...valid, time: '24:00' }).ok, false);
    assert.equal(validateMealForm({ ...valid, time: '08:05:30' }).ok, true);
    assert.equal(validateMealForm({ ...valid, date: '' }).ok, false);
    assert.equal(validateMealForm({ ...valid, date: '2026-02-30' }).ok, false);
    assert.equal(validateMealForm({ ...valid, date: '2028-02-29' }).ok, true);
  });
});

describe('numeric input sanitizing', () => {
  test('normalizes commas and rejects non-numeric keystrokes', () => {
    assert.equal(sanitizeNumericInput('3,5'), '3.5');
    assert.equal(sanitizeNumericInput(''), '');
    assert.equal(sanitizeNumericInput('12a'), null);
    assert.equal(sanitizeNumericInput('1.2.3'), null);
  });
});
