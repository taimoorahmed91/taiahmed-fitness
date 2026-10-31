import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSTANT_PAD_RATIO, ZERO_SNAP_RATIO, barAxisNote, computeChartDomain, niceStep } from '../src/lib/chartDomain';

// The one Y-axis rule for every switchable line / bar chart. Domains below are the documented, deterministic
// outcomes; the same call is used for Line and Bar, so there is nothing mode specific to test here.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const d = (values: unknown[], options?: Parameters<typeof computeChartDomain>[1]) => computeChartDomain(values, options);

describe('small changes are visible (no forced zero)', () => {
  test('91 -> 92 kg is zoomed around the data, never [0, ...]', () => {
    const r = d([91, 92]);
    assert.deepEqual(r.domain, [90.5, 92.5]);
    assert.deepEqual(r.ticks, [90.5, 91, 91.5, 92, 92.5]);
    assert.equal(r.floor, 90.5);
  });
  test('a waist trend 90 -> 92 keeps its floor near the data', () => {
    assert.deepEqual(d([90, 91, 92]).domain, [89, 93]);
  });
  test('constant series (91, 91, 91): a real, non-zero range around the value', () => {
    const r = d([91, 91, 91]);
    assert.deepEqual(r.domain, [89, 93]);
    assert.ok(r.domain[0] > 0 && r.domain[1] - r.domain[0] >= 2);
    assert.equal(CONSTANT_PAD_RATIO, 0.02);
    // large constant: padded in proportion (2% of 1800 = 36), not by half a unit
    assert.deepEqual(d([1800, 1800], { minPad: 1 }).domain, [1760, 1840]);
  });
  test('every tick is inside the domain, the floor is the first tick and the top the last', () => {
    for (const v of [[91, 92], [91], [5, 9], [20, 60], [-594, 2991], [1300, 2300], [0, 3]]) {
      const r = d(v, { minPad: 1 });
      assert.equal(r.ticks[0], r.domain[0]);
      assert.equal(r.ticks.at(-1), r.domain[1]);
      assert.ok(r.ticks.every((t, i) => i === 0 || t > r.ticks[i - 1]), `increasing: ${r.ticks}`);
    }
  });
});

describe('zero stays when zero is meaningful', () => {
  test('rule: non-negative data snaps its floor to 0 when the padded floor is at or below 25% of the padded top', () => {
    assert.equal(ZERO_SNAP_RATIO, 0.25);
    assert.deepEqual(d([20, 60, 45]).domain, [0, 80]);          // duration: reaches low relative to its height
    assert.deepEqual(d([60, 234], { minPad: 1 }).domain, [0, 300]); // protein
    assert.deepEqual(d([0, 3]).domain, [0, 4]);                 // near zero
    assert.equal(d([0, 0]).floor, 0);
  });
  test('data well above zero keeps its zoom (sleep 5..9 h, calories 1300..2300)', () => {
    assert.deepEqual(d([5, 9, 7]).domain, [4, 10]);
    assert.deepEqual(d([1300, 2300], { minPad: 1 }).domain, [1000, 2500]);
  });
  test('the floor can never be negative for non-negative data', () => {
    for (const v of [[0.1, 0.2], [1, 2], [0, 100], [3]]) assert.ok(d(v).domain[0] >= 0, String(v));
  });
});

describe('negative values', () => {
  test('negative and positive: the negative floor is kept and zero is inside', () => {
    const r = d([-594, 300, 2991], { minPad: 1 });
    assert.deepEqual(r.domain, [-1000, 4000]);
    assert.ok(r.ticks.includes(0));
    assert.ok(r.domain[0] <= -594 && r.domain[1] >= 2991);
  });
  test('all negative: no clamping to zero, every value is inside', () => {
    const r = d([-300, -100]);
    assert.ok(r.domain[0] <= -300 && r.domain[1] >= -100);
    assert.ok(r.domain[1] <= 0 + 1e-9 || r.domain[1] < 100);
  });
});

describe('several series, nulls and empty', () => {
  test('all series count: the domain covers the min of one series and the max of another', () => {
    const rows = [{ a: 1500, lo: 1800, hi: 2200 }, { a: 1950, lo: 1800, hi: 2200 }];
    const r = d(rows.flatMap((x) => [x.a, x.lo, x.hi]), { minPad: 1 });
    assert.ok(r.domain[0] <= 1500 && r.domain[1] >= 2200);
  });
  test('null, undefined, NaN, Infinity and text are ignored', () => {
    assert.deepEqual(d([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 'x', 5, 7]).domain, [4, 8]);
    assert.deepEqual(d([null, 5, 7]).domain, d([5, 7]).domain);
  });
  test('nothing at all: a harmless [0, 1] axis', () => {
    assert.deepEqual(d([]).domain, [0, 1]);
    assert.deepEqual(d([null, undefined]).domain, [0, 1]);
  });
});

describe('hard cap', () => {
  test('a percentage with a cap of 100 never goes above 100 and keeps its zoom when it can', () => {
    assert.deepEqual(d([20, 95], { cap: 100, minPad: 1 }).domain, [0, 100]);
    assert.deepEqual(d([60, 95], { cap: 100, minPad: 1 }).domain, [50, 100]);
    assert.equal(d([97, 99], { cap: 100, minPad: 1 }).domain[1], 100);
  });
  test('the cap never hides a visible value: data above the cap stays inside the axis', () => {
    const r = d([105, 110], { cap: 100, minPad: 1 });
    assert.ok(r.domain[1] >= 110);
  });
  test('without a cap the top is padded above the largest value', () => {
    assert.ok(d([60, 95], { minPad: 1 }).domain[1] > 95);
  });
});

describe('niceStep and the bar-mode note', () => {
  test('steps are 1, 2, 2.5 or 5 times a power of ten', () => {
    assert.deepEqual([0.04, 0.4, 1, 1.1, 2.2, 4.9, 7, 240, 860].map(niceStep), [0.05, 0.5, 1, 2, 2.5, 5, 10, 250, 1000]);
  });
  test('"Axis starts at ..." only when bars start above zero, with the unit', () => {
    assert.equal(barAxisNote(90.5, 'kg'), 'Axis starts at 90.5 kg');
    assert.equal(barAxisNote(1000, 'cal'), 'Axis starts at 1,000 cal');
    assert.equal(barAxisNote(50, '%'), 'Axis starts at 50%');
    assert.equal(barAxisNote(4, ''), 'Axis starts at 4');
    assert.equal(barAxisNote(0, 'kg'), null);
    assert.equal(barAxisNote(-1000, 'cal'), null);
  });
});

describe('TrendChart and MacroTargetChart share the rule (source)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const trend = strip(read('src/components/TrendChart.tsx'));
  const macro = strip(read('src/components/MacroTargetChart.tsx'));
  test('both compute ONE domain from computeChartDomain and hand the same domain and ticks to the Y axis', () => {
    for (const [name, src] of [['TrendChart', trend], ['MacroTargetChart', macro]]) {
      assert.equal((src.match(/computeChartDomain\(/g) ?? []).length, 1, name);
      assert.match(src, /<YAxis domain=\{domain\} ticks=\{ticks\} \{\.\.\.chartYAxisProps\} \/>/, name);
      assert.equal((src.match(/<YAxis\b/g) ?? []).length, 1, name);
    }
  });
  test('no Bar-specific zero branch remains: nothing about the domain depends on the style', () => {
    const domainBlock = (src: string) => src.slice(src.indexOf('computeChartDomain('), src.indexOf(');', src.indexOf('computeChartDomain(')));
    assert.equal(/style/.test(domainBlock(trend)), false);
    assert.equal(/style/.test(domainBlock(macro)), false);
    for (const src of [trend, macro]) {
      assert.equal(/Math\.min\(0,|min = 0|\[0, |domain=\{\[/.test(src), false, 'no hand-written zero domain');
      assert.equal(/const (y?[dD]omain|pad|min|max) = /.test(src.replace(/const \{ domain, ticks, floor \} = /, '')), false, 'no second domain calculation');
    }
  });
  test('Macro includes actual, min and max in the domain; Trend includes every series', () => {
    assert.match(macro, /computeChartDomain\(shown\.flatMap\(\(d\) => \[d\.actual, d\.min, d\.max\]\), \{ minPad: 1 \}\)/);
    assert.match(trend, /computeChartDomain\(shown\.flatMap\(row => series\.map\(s => row\[s\.key\]\)\), \{ cap, minPad: cap \? 1 : 0\.5 \}\)/);
  });
  test('the bar note is built only in bar mode and reaches the visible caption and the screen reader summary', () => {
    for (const src of [trend, macro]) {
      assert.match(src, /'bar' \? barAxisNote\(floor, unit\) : null/);
      assert.match(src, /caption=\{`.*\$\{axisNote \? ` · \$\{axisNote\}` : ''\}/);
      assert.match(src, /\$\{axisNote\}, not zero\./);
    }
  });
  test('fixed-window charts and the shared header are untouched by this rule', () => {
    for (const f of ['src/components/charts/WeeklyBarChart.tsx', 'src/components/charts/DeltaChart.tsx', 'src/components/ReportCharts.tsx']) {
      assert.equal(/chartDomain/.test(read(f)), false, f);
    }
  });
});
