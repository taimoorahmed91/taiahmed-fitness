import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampRange, formatChartDate, recentChartData, windowChartRows } from '../src/lib/chartRange.ts';
import { describeSeries } from '../src/lib/chartSummary.ts';
import { computeDeltaSeries } from '../src/lib/deltaSeries.ts';
import { MIN_CHART_FONT_SIZE, chartTooltipProps, chartXAxisProps, chartYAxisProps, chartLegendProps, formatChartValue, formatSigned } from '../src/lib/chartTheme.ts';
import { STATUS_META, adherenceCellLabel, describeLimit, describeTarget } from '../src/lib/targetStatus.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('calendar ranges', () => {
  const rows = ['2026-10-23', '2026-10-24', '2026-10-27', '2026-10-30', '2026-10-31'].map((date) => ({ date }));

  test('window is inclusive of both ends and uses calendar days, not row counts', () => {
    // 7 days ending 10-30 = 10-24..10-30; the future row and the older row are out.
    assert.deepEqual(recentChartData(rows, '7', '2026-10-30').map((r) => r.date), ['2026-10-24', '2026-10-27', '2026-10-30']);
    assert.deepEqual(recentChartData(rows, '14', '2026-10-30').map((r) => r.date), ['2026-10-23', '2026-10-24', '2026-10-27', '2026-10-30']);
  });

  test('"all" keeps everything, sorted', () => {
    assert.equal(recentChartData([...rows].reverse(), 'all', '2026-10-30').length, 5);
    assert.equal(recentChartData([...rows].reverse(), 'all', '2026-10-30')[0].date, '2026-10-23');
  });

  test('window crosses month and year boundaries in UTC', () => {
    const data = ['2025-12-31', '2026-01-01', '2026-01-02'].map((date) => ({ date }));
    assert.deepEqual(recentChartData(data, '7', '2026-01-02').map((r) => r.date), ['2025-12-31', '2026-01-01', '2026-01-02']);
    assert.deepEqual(recentChartData(data, '7', '2026-01-02').length, 3);
  });

  test('legacy MM/DD series falls back to the trailing rows', () => {
    const legacy = Array.from({ length: 90 }, (_, i) => ({ date: `d${i}` }));
    assert.equal(windowChartRows(legacy, '30').length, 30);
    assert.equal(windowChartRows(legacy, '30')[29].date, 'd89');
    assert.equal(windowChartRows(legacy, 'all').length, 90);
  });

  test('ISO series uses the calendar window even through windowChartRows', () => {
    assert.equal(windowChartRows(rows, '7', '2026-10-30').length, 3);
  });

  test('a shared range wider than a chart supports is clamped to its widest', () => {
    assert.equal(clampRange('all', ['7', '14', '30', '90']), '90');
    assert.equal(clampRange('30', ['7', '14', '30', '90']), '30');
    assert.equal(clampRange('90', ['7', '30']), '30');
    assert.equal(clampRange('all', ['7', '14', '30', '90', 'all']), 'all');
  });

  test('date label', () => {
    assert.equal(formatChartDate('2026-10-30'), '10/30');
    assert.equal(formatChartDate('Oct 5'), 'Oct 5');
  });
});

describe('delta series', () => {
  test('keeps the existing per-interval and overall maths', () => {
    const { points, last, overall } = computeDeltaSeries([
      { date: '2026-10-10', value: 80 },
      { date: '2026-10-03', value: 82 },
      { date: '2026-10-17', value: 79 },
      { date: '2026-10-20', value: 0 }, // ignored: not a real measurement
    ]);
    assert.equal(points.length, 2);
    assert.deepEqual(points.map((p) => p.date), ['10/10', '10/17']);
    assert.equal(points[0].delta, -2);
    assert.equal(points[0].days, 7);
    assert.equal(points[0].perWeek, -2);
    assert.equal(last?.delta, -1);
    assert.deepEqual(overall, { change: -3, days: 14, perWeek: -1.5 });
  });

  test('needs two distinct days and caps displayed intervals', () => {
    assert.deepEqual(computeDeltaSeries([{ date: '2026-10-10', value: 80 }]).points, []);
    assert.equal(computeDeltaSeries([{ date: '2026-10-10', value: 80 }, { date: '2026-10-10', value: 81 }]).overall, null);
    const many = Array.from({ length: 15 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 80 + i }));
    const r = computeDeltaSeries(many);
    assert.equal(r.points.length, 10);
    assert.equal(r.overall?.days, 14);
  });
});

describe('target status wording', () => {
  const range = { min: 1900, max: 2200 };
  test('matches the three states', () => {
    assert.equal(describeTarget(1500, range, 'cal').text, '400 cal under your minimum');
    assert.equal(describeTarget(2330, range, 'cal').text, '130 cal over your maximum');
    assert.equal(describeTarget(2000, range, 'cal').text, 'Within your 1,900\u20132,200 cal target');
    assert.equal(describeTarget(1900, range, 'cal').status, 'within');
    assert.equal(describeTarget(2200, range, 'cal').status, 'within');
  });
  test('single-value target prints one number', () => {
    assert.equal(describeTarget(2000, { min: 2000, max: 2000 }, 'cal').text, 'Within your 2,000 cal target');
  });
  test('limit rows', () => {
    assert.deepEqual(describeLimit(1500, 1900, 'min', 'cal'), { text: '400 cal to go', pct: 79 });
    assert.equal(describeLimit(2000, 1900, 'min', 'cal').text, 'Reached');
    assert.equal(describeLimit(2330, 2200, 'max', 'cal').text, '130 cal over');
    assert.equal(describeLimit(2000, 2200, 'max', 'cal').text, '200 cal left');
  });
  test('every status has a distinct glyph and word, so colour is never the only cue', () => {
    const metas = Object.values(STATUS_META);
    assert.equal(new Set(metas.map((m) => m.glyph)).size, metas.length);
    assert.equal(new Set(metas.map((m) => m.label)).size, metas.length);
    assert.match(adherenceCellLabel('2026-10-30', 'over'), /Over max/);
    assert.match(adherenceCellLabel('2026-10-30', null), /Not logged/);
  });
  test('uses the semantic roles: green on target, red over, amber under', () => {
    assert.match(STATUS_META.within.fill, /chart-min/);
    assert.match(STATUS_META.over.fill, /chart-max/);
    assert.match(STATUS_META.under.fill, /chart-warn/);
  });
});

describe('summary + formatting', () => {
  test('describeSeries reads out latest, range and average', () => {
    const text = describeSeries([{ date: '2026-10-01', w: 80 }, { date: '2026-10-08', w: 78 }], [{ key: 'w', label: 'Weight', unit: 'kg' }], 'Last 30 days');
    assert.match(text, /Last 30 days\./);
    assert.match(text, /from 10\/01 to 10\/08/);
    assert.match(text, /Latest 78\.0 kg, lowest 78\.0 kg, highest 80\.0 kg, average 79\.0 kg/);
  });
  test('empty data is stated, not silent', () => {
    assert.match(describeSeries([], [{ key: 'w', label: 'Weight' }], 'Last 7 days'), /^No data/);
  });
  test('units are spelled one way', () => {
    assert.equal(formatChartValue(1250, 'cal'), '1,250 cal');
    assert.equal(formatChartValue(73, '%'), '73%');
    assert.equal(formatChartValue(null, 'kg'), '--');
    assert.equal(formatSigned(-0.4, 'kg'), '\u22120.40 kg');
    assert.equal(formatSigned(1.5, 'kg/week', 1), '+1.5 kg/week');
  });
});

describe('shared chart theme', () => {
  test('functional text is at least 12px everywhere', () => {
    const sizes = [
      chartXAxisProps.tick.fontSize,
      chartYAxisProps.tick.fontSize,
      chartLegendProps.wrapperStyle.fontSize,
      chartTooltipProps.contentStyle.fontSize,
      chartTooltipProps.itemStyle.fontSize,
      chartTooltipProps.labelStyle.fontSize,
    ];
    sizes.forEach((s) => assert.ok(s >= 12 && s >= MIN_CHART_FONT_SIZE, `font ${s}`));
  });
});

describe('owned chart/card files use semantic roles only', () => {
  const src = join(root, 'src');
  const files = [
    ...readdirSync(join(src, 'components')).filter((f) => /Chart.*\.tsx$/.test(f) || ['ChartViewControls.tsx', 'TargetAdherenceGrid.tsx', 'TargetRangeBar.tsx', 'MacroTargetCard.tsx', 'CalorieGoalProgress.tsx', 'YesterdayStatus.tsx', 'GoalsCard.tsx', 'ShareableSummary.tsx', 'BodyRecompositionCard.tsx'].includes(f)).map((f) => join(src, 'components', f)),
    ...readdirSync(join(src, 'components/charts')).map((f) => join(src, 'components/charts', f)),
    ...['chartRange', 'chartTheme', 'chartSummary', 'deltaSeries', 'targetStatus'].map((n) => join(src, 'lib', `${n}.ts`)),
  ];
  const raw = /\b(?:text|bg|border|stroke|fill|from|to|via|ring)-(?:green|red|orange|amber|yellow|indigo|emerald|rose|teal|blue|purple|pink|sky|violet|lime|cyan)-\d{2,3}\b|hsl\(\s*\d/;
  const tiny = /text-\[(?:[0-9]|1[01])px\]|fontSize:\s*(?:[0-9]|1[01])\b/;
  test('no raw hue classes, hard-coded hsl() colours or text under 12px', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, raw, `${file} has a raw colour`);
      assert.doesNotMatch(text, tiny, `${file} has text under 12px`);
    }
  });
});
