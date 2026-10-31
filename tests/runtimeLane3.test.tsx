import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetRangeBar } from '../src/components/TargetRangeBar.tsx';
import { calorieBalanceRows, calorieBalanceTickLabels } from '../src/components/CalorieBalanceChart.tsx';
import { formatChartDate } from '../src/lib/chartRange.ts';

// Runtime corrective lane 3: contrast-safe chips, collision-safe Min/Max labels, real x-axis dates.
// Contrast is computed from the shipped tokens in src/index.css, so a token change that breaks a pairing fails here.
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const css = read('src/index.css');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector} block`);
  const end = css.indexOf('\n  }', start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const themes = { light: block(':root'), dark: block('.dark') };

function toRgb(hsl: string): number[] {
  const m = hsl.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  assert.ok(m, `token is not a plain "H S% L%" triple: ${hsl}`);
  const h = Number(m[1]); const s = Number(m[2]) / 100; const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (rgb: number[]) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const TEXT_PAIRS: [string, string][] = [
  ['primary-foreground', 'primary'], // header avatar initial
  ['secondary-foreground', 'secondary'], // Daily Notes severity badge
  ['accent-foreground', 'accent'], // Extra Activity "+N cal" chip
  ['foreground', 'muted'], // Sleep quality chip
  ['muted-foreground', 'card'], // Min / Max amounts
  ['foreground', 'card'], // Min / Max words
];
// Hues that only carry meaning as a border or dot, on the surface of the chip they outline.
const NON_TEXT_PAIRS: [string, string][] = [
  ['chart-min', 'secondary'], ['chart-warn', 'secondary'], ['destructive', 'secondary'],
  ['chart-min', 'muted'], ['chart-warn', 'muted'], ['chart-max', 'muted'],
  ['primary', 'accent'],
];

for (const [name, t] of Object.entries(themes)) {
  describe(`${name} theme chip pairings`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      test(`${fg} on ${bg} >= 4.5`, () => {
        const r = ratio(toRgb(t[fg]), toRgb(t[bg]));
        assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}`);
      });
    }
    for (const [fg, bg] of NON_TEXT_PAIRS) {
      test(`border/dot ${fg} on ${bg} >= 3`, () => {
        const r = ratio(toRgb(t[fg]), toRgb(t[bg]));
        assert.ok(r >= 3, `${fg} on ${bg}: ${r.toFixed(2)}`);
      });
    }
  });
}

const PALETTE = /\b(?:bg|text|border|fill|stroke|from|to|ring|divide)-(?:red|green|blue|yellow|orange|amber|emerald|rose|purple|violet|pink|cyan|teal|sky|indigo|lime|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g;
const FILES = [
  'src/components/layout/AccountMenu.tsx',
  'src/components/DailyNotesList.tsx',
  'src/pages/ExtraActivities.tsx',
  'src/pages/Sleep.tsx',
  'src/components/TargetRangeBar.tsx',
  'src/components/CalorieBalanceChart.tsx',
];

describe('lane 3 class pairings in source', () => {
  test('no raw hue classes or hex colours in the files this lane owns', () => {
    for (const file of FILES) {
      const src = read(file);
      assert.deepEqual(src.match(PALETTE) ?? [], [], file);
      assert.deepEqual(src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) ?? [], [], file);
    }
  });

  test('header avatar initial is primary-foreground on a solid primary fill', () => {
    const src = read('src/components/layout/AccountMenu.tsx');
    const avatar = src.match(/className="([^"]*rounded-full[^"]*uppercase[^"]*)"/)?.[1] ?? '';
    assert.match(avatar, /\bbg-primary\b(?!\/)/);
    assert.match(avatar, /\btext-primary-foreground\b/);
    assert.doesNotMatch(avatar, /\btext-primary\b(?!-)/);
    assert.doesNotMatch(avatar, /bg-primary\//);
  });

  test('severity badge keeps secondary-foreground text on the secondary surface and keeps its words', () => {
    const src = read('src/components/DailyNotesList.tsx');
    const fn = src.slice(src.indexOf('const getSeverityColor'), src.indexOf('const getSeverityDot'));
    const classes = [...fn.matchAll(/return '([^']+)'/g)].map((m) => m[1]).filter(Boolean);
    assert.equal(classes.length, 3);
    for (const c of classes) {
      assert.match(c, /\bbg-secondary\b/);
      assert.match(c, /\btext-secondary-foreground\b/);
      assert.doesNotMatch(c, /\btext-(?:primary|chart-[a-z0-9]+|destructive)\b/);
      assert.match(c, /\bborder-(?:chart-min|chart-warn|destructive)\b/);
    }
    assert.match(src, /Severity: \{note\.severity\}\/5/);
  });

  test('"+N cal" chip is accent-foreground on accent, not text-primary on a tint', () => {
    const src = read('src/pages/ExtraActivities.tsx');
    const chip = src.match(/const CALORIE_CHIP_CLASS = '([^']+)'/)?.[1] ?? '';
    assert.match(chip, /\bbg-accent\b/);
    assert.match(chip, /\btext-accent-foreground\b/);
    assert.doesNotMatch(chip, /\btext-primary\b(?!-)/);
    assert.match(src, /<Badge variant="outline" className=\{CALORIE_CHIP_CLASS\}>\+\{a\.calories\} cal<\/Badge>/);
  });

  test('Sleep quality chips use text-foreground on bg-muted with a label, dot and border (shared BandChip + sleepBand)', () => {
    const chip = read('src/components/history/BandChip.tsx');
    assert.match(chip, /rounded-full border bg-muted px-2 py-0\.5 text-xs font-medium text-foreground/);
    assert.doesNotMatch(chip, /\btext-chart-/);
    assert.deepEqual([...chip.matchAll(/border: '([^']+)'/g)].map((m) => m[1]), ['border-chart-min', 'border-chart-warn', 'border-chart-max']);
    assert.deepEqual([...chip.matchAll(/dot: '([^']+)'/g)].map((m) => m[1]), ['bg-chart-min', 'bg-chart-warn', 'bg-chart-max']);
    assert.match(chip, /\{label\}/);
    const lib = read('src/lib/bodyHistory.ts');
    for (const label of ['Good', 'Fair', 'Poor']) assert.match(lib, new RegExp(`label: '${label}'`));
    // The overview and every history row use the one chip and the one band function.
    const sleep = read('src/pages/Sleep.tsx');
    assert.match(sleep, /<BandChip label=\{q\.label\} tone=\{q\.tone\}/);
    assert.match(sleep, /sleepBand\(/);
  });
});

describe('TargetRangeBar Min / Max labels', () => {
  const labelsOf = (html: string) => {
    const dl = html.match(/<dl data-limit-labels[^>]*>(.*?)<\/dl>/s)?.[1] ?? '';
    return [...dl.matchAll(/<div data-limit-label="([^"]+)"[^>]*>(.*?)<\/div>/gs)].map((m) => ({
      key: m[1],
      html: m[0],
      text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }));
  };
  const render = (current: number, min: number, max: number, unit = 'cal') =>
    renderToStaticMarkup(createElement(TargetRangeBar, { current, range: { min, max }, unit }));

  test('2000 / 2200 render as two distinct labelled amounts, Min before Max', () => {
    const labels = labelsOf(render(1500, 2000, 2200));
    assert.deepEqual(labels.map((l) => l.key), ['min', 'max']);
    assert.equal(labels[0].text, 'Min 2,000 cal');
    assert.equal(labels[1].text, 'Max 2,200 cal');
  });

  test('labels sit in a flow row: never absolutely positioned or placed by percentage', () => {
    for (const [min, max] of [[2000, 2200], [2000, 2001], [150, 150.4], [0, 1]]) {
      const html = render(1, min, max);
      const row = html.match(/<dl data-limit-labels.*?<\/dl>/s)?.[0] ?? '';
      assert.ok(row.length > 0);
      assert.doesNotMatch(row, /\babsolute\b|style="|left:|translate/);
      assert.match(row, /\bjustify-between\b/);
      assert.match(row, /\bflex-wrap\b/);
    }
  });

  test('ticks still sit at the real target positions and are hidden from screen readers', () => {
    const html = render(1000, 2000, 2200);
    const scale = 2200 * 1.15;
    const left = (key: string) => Number(html.match(new RegExp(`data-limit-tick="${key}"[^>]*style="left:([\\d.]+)%`))?.[1]);
    assert.ok(Math.abs(left('min') - (2000 / scale) * 100) < 0.01);
    assert.ok(Math.abs(left('max') - (2200 / scale) * 100) < 0.01);
    assert.ok(left('max') > left('min'));
    for (const m of html.matchAll(/<div[^>]*data-limit-tick[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/);
  });

  test('a single-value target shows one label instead of a duplicate Min and Max', () => {
    const labels = labelsOf(render(1000, 2000, 2000));
    assert.deepEqual(labels.map((l) => l.text), ['Target 2,000 cal']);
  });

  test('works without a unit and keeps the meter semantics', () => {
    const html = render(1500, 2000, 2200, '');
    assert.deepEqual(labelsOf(html).map((l) => l.text), ['Min 2,000', 'Max 2,200']);
    assert.match(html, /role="meter"/);
    assert.match(html, /aria-valuenow="1500"/);
  });
});

describe('CalorieBalanceChart x-axis dates', () => {
  const row = (date: string, balance = 0) => ({ date, consumed: 1800, burned: 1800 + balance, balance });

  test('each tick label comes from its own row date (UTC, MM/DD)', () => {
    const rows = calorieBalanceRows([row('2026-10-28'), row('2026-10-29'), row('2026-10-30')]);
    assert.deepEqual(calorieBalanceTickLabels(rows), ['10/28', '10/29', '10/30']);
    assert.equal(new Set(calorieBalanceTickLabels(rows)).size, rows.length);
  });

  test('rows come out oldest first even when given newest first', () => {
    const rows = calorieBalanceRows([row('2026-10-30'), row('2026-10-28'), row('2026-10-29')]);
    assert.deepEqual(rows.map((r) => r.date), ['2026-10-28', '2026-10-29', '2026-10-30']);
  });

  test('duplicate dates collapse to one row (the later one wins) so no tick repeats', () => {
    const rows = calorieBalanceRows([row('2026-10-29', 10), row('2026-10-29', 20), row('2026-10-29', 30), row('2026-10-30', 5)]);
    assert.deepEqual(rows.map((r) => r.date), ['2026-10-29', '2026-10-30']);
    assert.equal(rows[0].balance, 30);
    assert.equal(new Set(calorieBalanceTickLabels(rows)).size, rows.length);
  });

  test('dates are never shifted by the machine time zone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        process.env.TZ = tz;
        assert.deepEqual(calorieBalanceTickLabels([row('2026-01-01'), row('2026-12-31')]), ['01/01', '12/31']);
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
    assert.equal(formatChartDate('2026-03-08'), '03/08');
  });

  test('rows without an ISO date cannot be placed on the calendar axis and are dropped', () => {
    assert.deepEqual(calorieBalanceRows([row('10/30'), row('2026-10-30')]).map((r) => r.date), ['2026-10-30']);
  });

  test('the chart feeds TrendChart the normalised rows and the shared MM/DD formatter', () => {
    const src = read('src/components/CalorieBalanceChart.tsx');
    assert.match(src, /calorieBalanceRows\(data\)/);
    assert.match(src, /data=\{rows\}/);
    const trend = read('src/components/TrendChart.tsx');
    assert.match(trend, /<XAxis dataKey="date" tickFormatter=\{chartDateLabel\}/);
  });
});
