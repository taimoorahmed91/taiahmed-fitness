import { describe, expect, test } from 'bun:test';
import { digitOffsetPercent, formatAnimatedNumber, formatBody, staggerDelays, tokenize } from '../src/lib/animatedNumber';
import { formatNumber } from '../src/lib/chartTheme';

const digits = (t: ReturnType<typeof tokenize>) => t.filter((x) => x.kind === 'digit').map((x) => (x.kind === 'digit' ? x.digit : -1));
const keys = (t: ReturnType<typeof tokenize>) => t.map((x) => x.key);

describe('formatting keeps the existing output exactly', () => {
  test('a plain number prints like String(value)', () => {
    expect(formatAnimatedNumber(72.5).text).toBe('72.5');
    expect(formatAnimatedNumber(0).text).toBe('0');
    expect(formatAnimatedNumber(-3).text).toBe('-3');
  });
  test('a custom format function is used as is (thousands separators, decimals)', () => {
    const f = { format: (v: number) => formatNumber(v, 0) };
    expect(formatAnimatedNumber(1234567, f).text).toBe('1,234,567');
    expect(formatAnimatedNumber(1999.6, f).text).toBe('2,000');
    expect(formatAnimatedNumber(7, { format: (v) => v.toFixed(1) }).text).toBe('7.0');
    expect(formatAnimatedNumber(12345, { format: (v) => v.toLocaleString() }).text).toBe((12345).toLocaleString());
  });
  test('Intl options work without a format function', () => {
    expect(formatAnimatedNumber(1234.5, { locale: 'en-US', formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } }).text).toBe('1,234.50');
    expect(formatBody(0.256, { locale: 'en-US', formatOptions: { style: 'percent' } })).toBe('26%');
  });
  test('prefix and suffix are added around the number', () => {
    expect(formatAnimatedNumber(5, { prefix: '+', suffix: ' kg', format: (v) => v.toFixed(1) }).text).toBe('+5.0 kg');
  });
  test('null, undefined and NaN show the fallback, "—" by default', () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      const r = formatAnimatedNumber(v);
      expect(r.text).toBe('—');
      expect(r.isFallback).toBe(true);
      expect(r.tokens.every((t) => t.kind === 'static')).toBe(true);
    }
    expect(formatAnimatedNumber(null, { fallback: '--', suffix: ' kg' }).text).toBe('--');
  });
  test('a digit inside the fallback never rolls', () => {
    expect(formatAnimatedNumber(null, { fallback: 'n/a 2' }).tokens.some((t) => t.kind === 'digit')).toBe(false);
  });
});

describe('tokenize', () => {
  test('digits roll, everything else is static', () => {
    const t = tokenize('1,234.5 kg');
    expect(digits(t)).toEqual([1, 2, 3, 4, 5]);
    expect(t.filter((x) => x.kind === 'static').map((x) => (x.kind === 'static' ? x.char : ''))).toEqual([',', '.', ' ', 'k', 'g']);
  });
  test('prefix and suffix characters stay static even if they are digits', () => {
    const t = tokenize('#12/7', { prefixLength: 1, suffixLength: 2 });
    expect(digits(t)).toEqual([1, 2]);
  });
  test('keys count from the right so columns survive a change in digit count', () => {
    const a = tokenize('999');
    const b = tokenize('1,000');
    expect(keys(a)).toEqual(['d2', 'd1', 'd0']);
    expect(keys(b)).toEqual(['d4', 's3', 'd2', 'd1', 'd0']);
    expect(keys(b).filter((k) => keys(a).includes(k))).toEqual(['d2', 'd1', 'd0']);
  });
  test('keys are unique', () => {
    const k = keys(tokenize('1,234,567.89 kcal'));
    expect(new Set(k).size).toBe(k.length);
  });
  test('handles empty text', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('staggerDelays', () => {
  test('nothing animates on first render', () => {
    expect(staggerDelays(null, tokenize('123'))).toEqual({});
  });
  test('an identical number has no delays', () => {
    expect(staggerDelays(tokenize('123'), tokenize('123'))).toEqual({});
  });
  test('only changed digits are staggered, left to right, 50ms apart', () => {
    expect(staggerDelays(tokenize('1,234'), tokenize('1,299'))).toEqual({ d1: 0, d0: 50 });
    expect(staggerDelays(tokenize('100'), tokenize('245'))).toEqual({ d2: 0, d1: 50, d0: 100 });
  });
  test('a new column (number grew) is not animated; only existing changed columns are', () => {
    const d = staggerDelays(tokenize('999'), tokenize('1,000'));
    expect(d).toEqual({ d2: 0, d1: 50, d0: 100 });
    expect(d.d4).toBeUndefined();
  });
  test('a custom step is honoured', () => {
    expect(staggerDelays(tokenize('11'), tokenize('22'), 80)).toEqual({ d1: 0, d0: 80 });
  });
});

describe('digitOffsetPercent', () => {
  test('moves a ten-row column by 10% per digit, never -0', () => {
    expect(digitOffsetPercent(0)).toBe(0);
    expect(Object.is(digitOffsetPercent(0), -0)).toBe(false);
    expect(digitOffsetPercent(3)).toBe(-30);
    expect(digitOffsetPercent(9)).toBe(-90);
  });
});
