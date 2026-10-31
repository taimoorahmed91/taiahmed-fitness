import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement, createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Card } from '../src/components/ui/card';
import { ChartHeader } from '../src/components/charts/ChartHeader';
import { TrendChart } from '../src/components/TrendChart';
import { MacroTargetChart } from '../src/components/MacroTargetChart';
import { MealTimeChart } from '../src/components/MealTimeChart';
import { BodyRecompositionCard } from '../src/components/BodyRecompositionCard';
import { ReportCharts } from '../src/components/ReportCharts';
import { WeeklyBarChart } from '../src/components/charts/WeeklyBarChart';
import { DeltaChart } from '../src/components/charts/DeltaChart';

// One header for every chart card: title (with its heading level), range / style controls and the PDF
// button, in one place. These tests pin the contract and fail if a chart lays its own header out again.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = (node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const pdf = { targetRef: createRef<HTMLElement>(), columns: [{ key: 'date', label: 'Date' }], rows: [] };
const card = (header: ReactElement) => html(createElement(Card, { titleSize: 'chart' }, header));
/** The markup inside the controls group (it holds no nested <div> after the range wrapper closes, so slice to the actions end). */
const controlsOf = (out: string) => out.slice(out.indexOf('data-chart-controls'));

describe('ChartHeader layout contract', () => {
  test('title is the Card heading with the chart size role (h3 / text-lg), icon hidden from screen readers', () => {
    const out = card(createElement(ChartHeader, { title: 'Weight Trend', icon: createElement('svg') }));
    assert.match(out, /<h3 class="[^"]*\btext-lg\b[^"]*">[^]*Weight Trend<\/h3>/);
    assert.match(out, /<span aria-hidden="true" class="contents"><svg><\/svg><\/span>/);
    assert.match(out, /data-chart-header=""/);
  });
  test('a Card headingLevel is respected (h2 under the page h1)', () => {
    const out = html(createElement(Card, { titleSize: 'chart', headingLevel: 'h2' }, createElement(ChartHeader, { title: 'T' })));
    assert.match(out, /<h2 /);
  });
  test('no controls at all: no controls group is drawn', () => {
    const out = card(createElement(ChartHeader, { title: 'Weekly Calories', description: 'Avg: 1' }));
    assert.equal(out.includes('data-chart-controls'), false);
    assert.match(out, /Avg: 1/);
  });
  test('range + style + PDF: one controls group, range first, then style and PDF together in the actions unit', () => {
    const out = card(createElement(ChartHeader, { title: 'Weight Trend', view: { range: '30', setRange: noop, style: 'line', setStyle: noop }, pdf }));
    const group = controlsOf(out);
    assert.equal(out.match(/data-chart-controls=""/g)?.length, 1);
    assert.match(group, /aria-label="Weight Trend range"/);
    const actions = group.slice(group.indexOf('data-chart-actions'));
    assert.match(actions, /aria-label="Weight Trend chart type"/);
    assert.match(actions, /aria-label="Download Weight Trend as PDF"/);
    assert.ok(group.indexOf('range"') < group.indexOf('data-chart-actions'), 'range before the actions unit');
    assert.ok(actions.indexOf('chart type') < actions.indexOf('Download'), 'style before PDF');
    assert.equal(group.slice(0, group.indexOf('data-chart-actions')).includes('Download'), false, 'PDF is not outside the actions unit');
  });
  test('range-only chart: no line/bar switch, PDF still sits in the controls group', () => {
    const out = card(createElement(ChartHeader, { title: 'Meal times', view: { range: '7', setRange: noop }, pdf }));
    assert.equal(out.includes('chart type'), false);
    assert.match(controlsOf(out), /Download Meal times as PDF/);
  });
  test('a style without its setter is not drawn (range-only stays range-only)', () => {
    const out = card(createElement(ChartHeader, { title: 'T', view: { range: '7', setRange: noop, style: 'line' } }));
    assert.equal(out.includes('chart type'), false);
  });
  test('the controls group is excluded from PDF capture, and the PDF button keeps its label and tooltip', () => {
    const out = card(createElement(ChartHeader, { title: 'T', view: { range: '7', setRange: noop }, pdf }));
    assert.match(out, /data-chart-controls="" data-chart-layout="card" data-html2canvas-ignore="true"/);
    assert.match(out, /aria-label="Download T as PDF" title="Download PDF" data-html2canvas-ignore="true"/);
  });
  test('one responsive contract: block rows, nothing beside the title, no width-dependent ordering', () => {
    const src = read('src/components/charts/ChartHeader.tsx');
    // The title block (title + description) is its own block above the controls, at every width.
    assert.match(src, /<div data-chart-text="" className="min-w-0 space-y-1">/);
    assert.match(src, /data-chart-description="" className="min-w-0 text-sm text-muted-foreground"/);
    // Card controls: a column of two rows at every width. No wrap / order / justify tricks.
    assert.match(src, /card: 'flex min-w-0 max-w-full flex-col items-start gap-2'/);
    // Row 2 is a never-wrapping, never-shrinking unit; row 1 may shrink inside the card.
    assert.match(src, /data-chart-controls-row="actions" data-chart-actions="" className="flex shrink-0 items-center gap-2"/);
    assert.match(src, /data-chart-controls-row="range" className="min-w-0 max-w-full"/);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/\border-\d|\bsm:order|justify-between|basis-full|sm:min-h|sm:\[@media/.test(code), false, 'no ad hoc reordering or desktop one-liner');
    const card = /card: '([^']+)'/.exec(src)![1];
    assert.equal(/\bwrap\b|flex-wrap|\b(sm|md|lg|xl):/.test(card), false, 'the card layout has no breakpoint or wrap variants');
    // Exactly two group instances: the card and the viewer.
    assert.equal(code.match(/<ChartControlsGroup\b/g)?.length, 2);
    assert.match(code, /layout="card"/);
    assert.match(code, /layout="viewer"/);
  });
  test('the viewer layout is the same two rows, side by side only from md up', () => {
    const src = read('src/components/charts/ChartHeader.tsx');
    assert.match(src, /viewer: 'flex min-w-0 max-w-full flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3'/);
  });
});

describe('PDF button stays reachable and named at every width', () => {
  const src = read('src/components/ChartPdfButton.tsx');
  test('same accessible name and tooltip; the word only goes visually hidden on very narrow screens (never display:none)', () => {
    assert.match(src, /aria-label=\{`Download \$\{title\} as PDF`\} title="Download PDF" data-html2canvas-ignore="true"/);
    assert.match(src, /<span className="ml-1 max-\[359px\]:sr-only">PDF<\/span>/);
    assert.equal(/max-\[359px\]:hidden/.test(src), false);
  });
  test('icon-only width still meets 44px, and the button never shrinks away inside the controls group', () => {
    assert.match(src, /className="min-w-11 shrink-0 text-xs"/);
  });
});

describe('every chart card is migrated to ChartHeader', () => {
  const props = { id: 'x', title: 'X', icon: null, unit: 'u', empty: 'e', series: [{ key: 'v', label: 'V', color: '#000' }] };
  const row = { date: new Date().toISOString().slice(0, 10), v: 1 };
  const controlsGroup = (out: string) => out.slice(out.indexOf('data-chart-controls'));

  test('TrendChart (Weight, Waist, Sleep, Recovery, Workout Duration, Calorie Balance): range + style + PDF together', () => {
    const out = html(createElement(TrendChart, { ...props, id: 'workout_duration', title: 'Workout Duration', data: [row], defaultStyle: 'bar', summary: () => 'Total: 1' }));
    assert.match(out, /data-chart-header/);
    const group = controlsGroup(out);
    assert.match(group, /Workout Duration range[^]*Workout Duration chart type[^]*Download Workout Duration as PDF/);
    assert.match(out, /Total: 1/);
  });
  test('TrendChart with extended ranges offers All inside the same group', () => {
    const out = html(createElement(TrendChart, { ...props, extendedRanges: true, data: [row] }));
    assert.match(controlsGroup(out), /aria-label="All time"|>All</);
  });
  test('MacroTargetChart (calories / protein / carbs targets): range + style + PDF together', () => {
    const out = html(createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', data: [{ date: row.date, actual: 1, min: null, max: null }] }));
    assert.match(controlsGroup(out), /Protein: Actual vs Target range[^]*chart type[^]*Download Protein: Actual vs Target as PDF/);
  });
  test('MealTimeChart: range-only + PDF together', () => {
    const d = [{ name: 'Morning', calories: 1, count: 1 }];
    const out = html(createElement(MealTimeChart, { data7: d, data14: d, data30: d, data90: d }));
    assert.match(controlsGroup(out), /Calories by Time of Day range[^]*Download/);
    assert.equal(out.includes('chart type'), false);
  });
  test('BodyRecompositionCard: range-only + PDF together, badges and message stay under the band', () => {
    const out = html(createElement(BodyRecompositionCard, { weight: [{ date: row.date, value: 80 }], waist: [] }));
    assert.match(controlsGroup(out), /Body Recomposition Index range[^]*Download/);
    assert.equal(out.includes('chart type'), false);
    assert.ok(out.indexOf('Δ Weight') > out.indexOf('data-chart-controls'));
  });
  test('fixed-window charts (WeeklyBarChart, DeltaChart, ReportCharts) use the header; their only control is the full-screen button', () => {
    const week = Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: `2001-01-0${i + 1}`, calories: 0 }));
    const outs = [
      html(createElement(WeeklyBarChart, { title: 'Weekly Calories', icon: null, data: week, valueKey: 'calories', label: 'Calories', unit: 'kcal', color: '#000' })),
      html(createElement(DeltaChart, { title: 'Weight Change', icon: null, unit: 'kg', entries: [], emptyText: 'Log two.' })),
      html(createElement(ReportCharts, { data: [] })),
    ];
    for (const out of outs) {
      assert.match(out, /data-chart-header/);
      assert.match(controlsOf(out), /data-chart-expand/);
      assert.equal(out.includes('Download'), false, 'no PDF here');
      assert.equal(out.includes('range"'), false, 'no range switch');
      assert.equal(out.includes('chart type'), false, 'no line/bar switch');
    }
    assert.match(outs[0], /Avg:/);
  });
});

/** The header as an ordered list of its parts, read from the markup, so order and grouping are exact. */
const outline = (out: string) =>
  [...out.matchAll(/<h3\b|data-chart-description=""|data-chart-controls-row="(range|actions)"|aria-label="[^"]*chart type"|aria-label="Download [^"]*PDF"|aria-label="Open [^"]*in full screen"/g)].map((m) => {
    const t = m[0];
    if (t === '<h3') return 'title';
    if (t.startsWith('data-chart-description')) return 'description';
    if (t.startsWith('data-chart-controls-row')) return `row:${m[1]}`;
    if (t.includes('chart type')) return 'style';
    if (t.includes('Download')) return 'pdf';
    return 'expand';
  });

describe('header structure and order (exact)', () => {
  const viewer = { render: () => createElement('p') };
  test('range + line/bar chart: title, description, range row alone, then [style, PDF, full screen]', () => {
    const out = card(createElement(ChartHeader, { title: 'Weight', description: 'Latest', view: { range: '30', setRange: noop, style: 'line', setStyle: noop }, pdf, viewer }));
    assert.deepEqual(outline(out), ['title', 'description', 'row:range', 'row:actions', 'style', 'pdf', 'expand']);
  });
  test('range-only chart: title, description, range row alone, then [PDF, full screen]', () => {
    const out = card(createElement(ChartHeader, { title: 'Meals', description: 'Share', view: { range: '30', setRange: noop }, pdf, viewer }));
    assert.deepEqual(outline(out), ['title', 'description', 'row:range', 'row:actions', 'pdf', 'expand']);
  });
  test('the range is never in the same row as the actions', () => {
    const out = card(createElement(ChartHeader, { title: 'T', view: { range: '7', setRange: noop, style: 'bar', setStyle: noop }, pdf, viewer }));
    const rangeRow = out.slice(out.indexOf('data-chart-controls-row="range"'), out.indexOf('data-chart-controls-row="actions"'));
    assert.match(rangeRow, /T range/);
    assert.equal(/chart type|Download|in full screen/.test(rangeRow), false);
  });
  test('fixed-window chart: title, description, then one actions row with only full screen', () => {
    const out = card(createElement(ChartHeader, { title: 'Weekly', description: 'Avg', viewer }));
    assert.deepEqual(outline(out), ['title', 'description', 'row:actions', 'expand']);
  });
  test('title and description come before every control, and extra rows (badges) come after them', () => {
    const out = card(createElement(ChartHeader, { title: 'T', description: 'D', view: { range: '7', setRange: noop }, pdf, viewer }, createElement('p', null, 'BADGES')));
    assert.ok(out.indexOf('>D<') < out.indexOf('data-chart-controls'));
    assert.ok(out.indexOf('data-chart-controls') < out.indexOf('BADGES'));
  });
  test('Calories by Time of Day (range-only) has exactly the same shape as a line/bar chart minus the style switch', () => {
    const d = [{ name: 'Morning', calories: 1, count: 1 }];
    const meal = outline(html(createElement(MealTimeChart, { data7: d, data14: d, data30: d, data90: d })));
    const trend = outline(html(createElement(TrendChart, { id: 'x', title: 'X', icon: null, unit: 'u', empty: 'e', series: [{ key: 'v', label: 'V', color: '#000' }], data: [{ date: new Date().toISOString().slice(0, 10), v: 1 }], summary: () => 'S' })));
    assert.deepEqual(meal, ['title', 'row:range', 'row:actions', 'pdf', 'expand']);
    assert.deepEqual(trend.filter((p) => p !== 'style' && p !== 'description'), meal);
    assert.equal(meal.includes('style'), false);
  });
  test('every real chart card follows the contract (title < description < range row < actions row; style, PDF, expand in that order)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = [{ name: 'Morning', calories: 1, count: 1 }];
    const week = Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: `2001-01-0${i + 1}`, calories: 0 }));
    const trend = { id: 'x', title: 'X', icon: null, unit: 'u', empty: 'e', series: [{ key: 'v', label: 'V', color: '#000' }], data: [{ date: today, v: 1 }] };
    const cards: [string, string][] = [
      ['trend', html(createElement(TrendChart, trend))],
      ['trend + description', html(createElement(TrendChart, { ...trend, summary: () => 'S' }))],
      ['macro', html(createElement(MacroTargetChart, { title: 'M', unit: 'g', data: [{ date: today, actual: 1, min: null, max: null }] }))],
      ['meal time', html(createElement(MealTimeChart, { data7: d, data14: d, data30: d, data90: d }))],
      ['body recomposition', html(createElement(BodyRecompositionCard, { weight: [{ date: today, value: 80 }], waist: [] }))],
      ['weekly', html(createElement(WeeklyBarChart, { title: 'W', icon: null, data: week, valueKey: 'calories', label: 'C', unit: 'u', color: '#000' }))],
      ['delta', html(createElement(DeltaChart, { title: 'D', icon: null, unit: 'kg', entries: [], emptyText: 'x' }))],
    ];
    const rank: Record<string, number> = { title: 0, description: 1, 'row:range': 2, 'row:actions': 3, style: 4, pdf: 5, expand: 6 };
    for (const [name, out] of cards) {
      const parts = outline(out);
      const ranks = parts.map((p) => rank[p]);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${name}: ${parts.join(' > ')}`);
      assert.equal(parts.at(-1), 'expand', name);
      assert.equal(new Set(parts).size, parts.length, `${name}: no part twice`);
      assert.equal(parts.includes('row:range') ? parts.indexOf('row:range') < parts.indexOf('row:actions') : true, true, name);
    }
  });
  test('the viewer shows the same two rows in the same order, and no second full-screen button (source)', () => {
    const src = read('src/components/charts/ChartHeader.tsx');
    const viewerUse = src.slice(src.indexOf('<ChartFullscreenDialog'));
    assert.match(viewerUse, /<ChartControlsGroup title=\{title\} view=\{view\} pdf=\{pdf && \{ \.\.\.pdf, targetRef: viewerCaptureRef \}\} actions=\{actions\} layout="viewer" \/>/);
    assert.equal(/popOut=/.test(viewerUse), false, 'the viewer never gets popOut');
  });
});

describe('source guard: nothing lays out its own chart header', () => {
  const dir = (path: string) => readdirSync(new URL(`../${path}`, import.meta.url));
  const chartFiles = [
    ...dir('src/components').filter((f) => /Chart.*\.tsx$/.test(f) || f === 'BodyRecompositionCard.tsx').map((f) => `src/components/${f}`),
    ...dir('src/components/charts').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/charts/${f}`),
  ].filter((f) => !/\/(ChartViewControls|ChartPdfButton|ChartNoteIndicator|ChartHeader)\.tsx$/.test(f));

  test('there are chart files to check', () => {
    assert.ok(chartFiles.length >= 14, String(chartFiles.length));
  });
  for (const file of chartFiles) {
    test(file, () => {
      const src = read(file);
      assert.equal(/<CardHeader\b/.test(src), false, 'use <ChartHeader>, not <CardHeader>');
      assert.equal(/ChartPdfButton|ChartRangeControls|ChartStyleControl|<ChartViewControls/.test(src), false, 'range / style / PDF are placed by ChartHeader');
      if (/<Card[\s>]/.test(src)) {
        assert.match(src, /<ChartHeader\b/, 'a chart card must use ChartHeader');
        assert.equal(/justify-between/.test(src), false, 'no hand-made header row in a chart card');
      }
      if (/<ChartHeader\b/.test(src)) assert.match(src, /<Card [^>]*titleSize="chart"/, 'title size comes from the Card role');
    });
  }
  test('no chart lays out or reorders control rows itself: the data-chart-* layout hooks belong to ChartHeader and the viewer only', () => {
    const all = [...dir('src/components').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/${f}`), ...dir('src/components/charts').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/charts/${f}`)];
    const users = all.filter((f) => /data-chart-(controls|actions|text)/.test(read(f)));
    assert.deepEqual(users, ['src/components/charts/ChartHeader.tsx']);
  });
  test('ChartHeader is the only place that mounts the PDF button and the range / style controls', () => {
    const all = [...dir('src/components').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/${f}`), ...dir('src/components/charts').map((f) => `src/components/charts/${f}`)];
    const users = all.filter((f) => /<ChartPdfButton|<ChartRangeControls|<ChartStyleControl/.test(read(f)));
    assert.deepEqual(users.filter((f) => !/ChartViewControls\.tsx$/.test(f)), ['src/components/charts/ChartHeader.tsx']);
  });
  test('wrapper charts delegate to TrendChart and own no card markup', () => {
    for (const f of ['WeightChart', 'WaistChart', 'SleepChart', 'RecoveryChart', 'WorkoutDurationChart', 'CalorieBalanceChart']) {
      const src = read(`src/components/${f}.tsx`);
      assert.match(src, /<TrendChart\b/, f);
      assert.equal(/<Card[\s>]/.test(src), false, f);
    }
  });
});
