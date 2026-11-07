import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement, createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Card } from '../src/components/ui/card';
import { ChartHeader } from '../src/components/charts/ChartHeader';
import { ChartFigure } from '../src/components/charts/ChartFigure';
import { EXPANDED_CHART_MIN_HEIGHT, chartDotRadius, chartMotionProps, chartXAxisFor, xAxisTickPlan } from '../src/lib/chartViewer';

// The full-screen chart viewer contract: one shared pop-out in ChartHeader, one shared viewer dialog, and
// every chart card either uses it or opts out on purpose. The real open / close / state behaviour is in
// tests/mounted/chartViewer.dom.tsx (real DOM).

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path: string) => readdirSync(new URL(`../${path}`, import.meta.url));
const html = (node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const pdf = { targetRef: createRef<HTMLElement>(), columns: [{ key: 'date', label: 'Date' }], rows: [] };
const viewer = { render: () => createElement('p', null, 'expanded') };
const card = (header: ReactElement) => html(createElement(Card, { titleSize: 'chart' }, header));
const actionsOf = (out: string) => out.slice(out.indexOf('data-chart-actions'));

describe('pop-out button in ChartHeader', () => {
  test('eligible card: a labelled "Open <title> in full screen" button with a tooltip, named like the PDF button', () => {
    const out = card(createElement(ChartHeader, { title: 'Weight Trend', view: { range: '30', setRange: noop }, pdf, viewer }));
    assert.match(out, /aria-label="Open Weight Trend in full screen"/);
    assert.match(out, /title="Full screen"/);
    assert.match(out, /aria-haspopup="dialog"/);
  });
  test('it sits beside the title with the "More chart actions" menu (full screen first, then the menu); the range row and the line/bar switch are below it, not here', () => {
    const out = card(createElement(ChartHeader, { title: 'T', view: { range: '7', setRange: noop, style: 'line', setStyle: noop }, pdf, viewer }));
    assert.equal(out.match(/data-chart-actions=""/g)?.length, 1);
    const actions = actionsOf(out).slice(0, actionsOf(out).indexOf('data-chart-controls'));
    assert.equal(actions.includes('chart type'), false);
    assert.ok(out.indexOf('data-chart-actions') < out.indexOf('T chart type'));
    assert.ok(actions.indexOf('Open T in full screen') < actions.indexOf('More chart actions for T'));
    assert.ok(out.indexOf('<h3') < out.indexOf('Open T in full screen'), 'beside the title, after it in the DOM');
  });
  test('range-only chart keeps no line/bar switch when it gains the pop-out', () => {
    const out = card(createElement(ChartHeader, { title: 'Meal times', view: { range: '7', setRange: noop }, pdf, viewer }));
    assert.equal(out.includes('chart type'), false);
    assert.match(actionsOf(out), /Open Meal times in full screen[^]*More chart actions for Meal times/);
  });
  test('a chart with no controls at all still gets its pop-out beside the title (and no controls group)', () => {
    const out = card(createElement(ChartHeader, { title: 'Weekly Calories', viewer }));
    assert.equal(out.includes('data-chart-controls'), false);
    assert.match(actionsOf(out), /Open Weekly Calories in full screen/);
    assert.equal(out.includes('Download'), false);
    assert.equal(out.includes('More chart actions'), false, 'nothing to export, so no menu');
  });
  test('opt-out is explicit: viewer={false} draws no pop-out (the export menu stays)', () => {
    const out = card(createElement(ChartHeader, { title: 'T', view: { range: '7', setRange: noop }, pdf, viewer: false }));
    assert.equal(out.includes('in full screen'), false);
    assert.match(out, /More chart actions for T/);
    assert.equal(card(createElement(ChartHeader, { title: 'T', viewer: false })).includes('data-chart-controls'), false);
  });
  test('the pop-out is excluded from PDF capture and is 32px on a mouse and 44px on touch; it is never a nested control', () => {
    const out = card(createElement(ChartHeader, { title: 'T', viewer }));
    assert.match(out, /data-chart-expand="" data-html2canvas-ignore="true"/);
    const src = read('src/components/charts/ChartFullscreenDialog.tsx');
    assert.match(src, /h-8 w-8 min-w-0 shrink-0 px-0 \[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11/);
    assert.match(src, /variant="outline"\s+size="sm"/, 'same Button size as the menu button');
    assert.match(read('src/components/ui/button.tsx'), /sm: "h-9 rounded-md px-3 \[@media\(pointer:coarse\)\]:min-h-11"/);
  });
  test('the viewer is closed by default: nothing of it is in the card markup', () => {
    const out = card(createElement(ChartHeader, { title: 'T', viewer }));
    assert.equal(out.includes('data-chart-viewer'), false);
    assert.equal(out.includes('<p>expanded</p>'), false);
    assert.match(out, /aria-expanded="false"/);
  });
});

describe('viewer dialog layout contract (source)', () => {
  const src = read('src/components/charts/ChartFullscreenDialog.tsx');
  test('phones fill the screen; desktop is about 94vw x 92dvh and never wider than the screen', () => {
    assert.match(src, /layout="mobile-full"/);
    assert.match(src, /sm:h-\[92dvh\] sm:max-h-\[94dvh\] sm:w-\[94vw\] sm:max-w-none/);
  });
  test('safe areas on every edge', () => {
    assert.match(src, /env\(safe-area-inset-top\)/);
    assert.match(src, /env\(safe-area-inset-bottom\)/);
    assert.match(src, /env\(safe-area-inset-left\)/);
    assert.match(src, /env\(safe-area-inset-right\)/);
  });
  test('title and description come from Radix Dialog, the close button is labelled and kept out of PDFs', () => {
    assert.match(src, /<DialogTitle/);
    assert.match(src, /<DialogDescription/);
    assert.match(src, /<CloseButton label="Close full screen view" data-html2canvas-ignore="true"/);
  });
  test('header stays put; only the chart area scrolls; the PDF captures the chart area, not the controls', () => {
    assert.match(src, /data-chart-viewer-header="" className=\{`shrink-0/);
    assert.match(src, /data-chart-viewer-scroll=""[^>]*className=\{`flex min-h-0 flex-1 flex-col overscroll-contain/);
    assert.match(src, /tableMode \? 'overflow-hidden' : 'overflow-y-auto'/);
    assert.match(src, /ref=\{captureRef\}\s+data-chart-viewer-capture=""/);
  });
  test('the expanded chart is only built while the viewer is open', () => {
    assert.match(src, /const ViewerBody = \(\{ viewer \}[^]*viewer\.render\(\)/);
  });
  test('motion: the shared dialog already removes animation durations for reduced motion', () => {
    assert.match(read('src/components/ui/dialog.tsx'), /motion-reduce:duration-0/);
  });
});

describe('ChartFigure in the viewer', () => {
  const figure = (expanded: boolean) => html(createElement(ChartFigure, { title: 'T', summary: 'S', expanded, height: 200 }, createElement('div')));
  test('expanded plot grows with its container and never drops under the minimum height', () => {
    assert.ok(EXPANDED_CHART_MIN_HEIGHT >= 360);
    const out = figure(true);
    assert.match(out, /data-chart-expanded=""/);
    assert.match(out, new RegExp(`data-chart-plot="" class="chart-plot relative w-full flex-1" style="min-height:${EXPANDED_CHART_MIN_HEIGHT}px"`));
    assert.match(out, /absolute inset-x-1 inset-y-1\.5/);
  });
  test('the card figure is unchanged: no expanded marker, no plot box', () => {
    const out = figure(false);
    assert.equal(out.includes('data-chart-expanded'), false);
    assert.equal(out.includes('data-chart-plot'), false);
  });
  test('summary is still available on demand and ids are instance based (card and viewer never share one)', () => {
    const a = figure(false);
    assert.match(a, /<div data-chart-summary/);
    assert.match(read('src/components/charts/ChartFigure.tsx'), /const id = useId\(\)/);
  });
});

describe('mode-aware x-axis ticks (data never changes)', () => {
  test('card mode is exactly the old behaviour', () => {
    assert.deepEqual(xAxisTickPlan(90, false), { interval: 'preserveEnd', minTickGap: 16, tickMargin: 2 });
    assert.equal(chartXAxisFor(7, false).minTickGap, 16);
  });
  test('viewer always labels first and last day and spaces labels wider the denser the series is', () => {
    const gap = (n: number) => xAxisTickPlan(n, true).minTickGap;
    assert.equal(xAxisTickPlan(90, true).interval, 'preserveStartEnd');
    assert.ok(gap(7) <= gap(30) && gap(30) < gap(45) && gap(45) < gap(90), `${gap(7)} ${gap(30)} ${gap(45)} ${gap(90)}`);
    assert.ok(gap(90) > xAxisTickPlan(90, false).minTickGap);
  });
  test('the viewer axis keeps the shared tick style (colour, size, no tick line)', () => {
    const props = chartXAxisFor(90, true);
    assert.equal(props.tickLine, false);
    assert.ok(props.tick.fontSize >= 12);
  });
  test('dense line charts get slightly smaller dots in the viewer only', () => {
    assert.equal(chartDotRadius(3, 90, true), 2);
    assert.equal(chartDotRadius(3, 90, false), 3);
    assert.equal(chartDotRadius(3, 30, true), 3);
    assert.equal(chartDotRadius(2, 90, true), 2);
  });
});

describe('reduced motion', () => {
  const g = globalThis as { window?: unknown };
  const original = g.window;
  const withMedia = (matches: boolean | null) => { g.window = matches === null ? undefined : { matchMedia: (q: string) => ({ matches: matches && /reduce/.test(q) }) }; };
  test('animations stay on by default and when no browser is present (server render)', () => {
    withMedia(null);
    assert.equal(chartMotionProps().isAnimationActive, true);
    withMedia(false);
    assert.equal(chartMotionProps().isAnimationActive, true);
    g.window = original;
  });
  test('people who asked for reduced motion get the finished chart straight away', () => {
    withMedia(true);
    assert.equal(chartMotionProps().isAnimationActive, false);
    g.window = original;
  });
  test('every line, bar and pie in a chart component takes the shared motion props', () => {
    const files = [
      ...dir('src/components').filter((f) => /Chart.*\.tsx$/.test(f) || f === 'BodyRecompositionCard.tsx').map((f) => `src/components/${f}`),
      ...dir('src/components/charts').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/charts/${f}`),
    ];
    for (const f of files) for (const m of read(f).matchAll(/<(Line|Bar|Pie)\s[^>]*>/g)) assert.match(m[0], /\{\.\.\.motion\}/, `${f}: ${m[0].slice(0, 40)}`);
  });
});

describe('every eligible chart uses the shared viewer contract', () => {
  const chartFiles = [
    ...dir('src/components').filter((f) => /Chart.*\.tsx$/.test(f) || f === 'BodyRecompositionCard.tsx').map((f) => `src/components/${f}`),
    ...dir('src/components/charts').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/charts/${f}`),
  ].filter((f) => /<ChartHeader\b/.test(read(f)));

  test('the chart cards we know about are all found', () => {
    const names = chartFiles.map((f) => f.split('/').pop());
    for (const n of ['TrendChart.tsx', 'MacroTargetChart.tsx', 'MealTimeChart.tsx', 'BodyRecompositionCard.tsx', 'WeeklyBarChart.tsx', 'DeltaChart.tsx', 'ReportCharts.tsx']) assert.ok(names.includes(n), n);
  });
  for (const file of chartFiles) {
    test(`${file}: every <ChartHeader> decides (viewer render, or an explicit false) and renders the same body in card and viewer`, () => {
      const src = read(file);
      const headers = src.match(/<ChartHeader\b/g)?.length ?? 0;
      const decisions = src.match(/viewer=\{(\{ render: \(\) => \w+\(true\), dataset(: \w+)?(, selection)?(, compare)? \}|false)\}/g)?.length ?? 0;
      assert.equal(decisions, headers, 'each ChartHeader needs viewer={{ render: () => body(true), dataset }} or viewer={false}');
      const renders = [...src.matchAll(/viewer=\{\{ render: \(\) => (\w+)\(true\), dataset(?:: \w+)? \}\}/g)].map((m) => m[1]);
      for (const name of renders) {
        assert.match(src, new RegExp(`const ${name} = \\(expanded: boolean\\)`), `${name} takes expanded`);
        assert.match(src, new RegExp(`<CardContent>\\{${name}\\(false\\)\\}</CardContent>`), `${name}(false) is the card body: one chart definition for both`);
        assert.match(src, /<ChartFigure\b[^>]*\bexpanded=\{expanded\}|<ChartFigure\s+expanded=\{expanded\}/, 'the figure receives expanded');
      }
    });
  }
  test('cartesian charts use the shared mode-aware x-axis, not the fixed one', () => {
    for (const f of chartFiles) {
      const src = read(f);
      if (!/<XAxis\b/.test(src)) continue;
      assert.equal(/\{\.\.\.chartXAxisProps\}/.test(src), false, `${f} still uses the fixed axis`);
      assert.match(src, /chartXAxisFor\(/, f);
    }
  });
  test('no chart keeps its own ViewerDialog or window.alert: only ChartHeader mounts the shared dialog', () => {
    const all = [...dir('src/components').filter((f) => f.endsWith('.tsx')).map((f) => `src/components/${f}`), ...dir('src/components/charts').map((f) => `src/components/charts/${f}`)];
    const users = all.filter((f) => /<ChartFullscreenDialog\b/.test(read(f)));
    assert.deepEqual(users, ['src/components/charts/ChartHeader.tsx']);
    for (const f of chartFiles) assert.equal(/alert\(|<Dialog\b|DialogContent/.test(read(f)), false, f);
  });
  test('every ChartHeader in src (pages too) states its viewer decision', () => {
    const files = ['src/components', 'src/components/charts', 'src/pages'].flatMap((d) => dir(d).filter((f) => f.endsWith('.tsx')).map((f) => `${d}/${f}`));
    for (const f of files) {
      if (f.endsWith('/ChartHeader.tsx')) continue;
      const src = read(f);
      const headers = src.match(/<ChartHeader\b/g)?.length ?? 0;
      if (headers) assert.equal(src.match(/\bviewer=/g)?.length ?? 0, headers, f);
    }
  });
});

describe('MacroTargetChart: the chart style applies to the whole chart (source)', () => {
  const src = read('src/components/MacroTargetChart.tsx');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const from = code.indexOf("style === 'bar' ? (");
  const split = code.indexOf(') : (', from);
  const bar = code.slice(from, split);
  const line = code.slice(split, code.indexOf('</ComposedChart>'));
  test('bar mode draws exactly three Bar series and no Line; line mode exactly three Line series and no Bar', () => {
    assert.deepEqual([...bar.matchAll(/<Bar\b[^>]*dataKey="(\w+)"/g)].map((m) => m[1]), ['actual', 'min', 'max']);
    assert.equal(/<Line\b/.test(bar), false);
    assert.deepEqual([...line.matchAll(/<Line\b[^>]*dataKey="(\w+)"/g)].map((m) => m[1]), ['actual', 'min', 'max']);
    assert.equal(/<Bar\b/.test(line), false);
  });
  test('series are only ever drawn inside the two style branches (nothing is always a line)', () => {
    assert.equal((code.match(/<Line\b/g) ?? []).length, 3);
    assert.equal((code.match(/<Bar\b/g) ?? []).length, 3);
  });
  test('bars are grouped (no stackId), use semantic chart colours only, and targets carry a non-colour cue', () => {
    assert.equal(/stackId/.test(code), false);
    assert.equal(/#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(\d/.test(code), false);
    assert.match(bar, /dataKey="min"[^>]*fillOpacity=\{0\.4\}[^>]*strokeWidth=\{1\.5\}/);
    assert.match(bar, /dataKey="max"[^>]*strokeDasharray="4 3"/);
  });
  test('line styling is unchanged: actual thick and solid, min dashed, max dotted', () => {
    assert.match(line, /dataKey="actual"[^>]*strokeWidth=\{3\.5\}/);
    assert.match(line, /dataKey="min"[^>]*strokeDasharray="8 5"/);
    assert.match(line, /dataKey="max"[^>]*strokeDasharray="2 5"/);
  });
  test('y axis is the shared zero-based rule over all three series (details: tests/chartAxis.test.ts)', () => {
    assert.match(src, /computeYAxis\(shown\.flatMap\(\(d\) => \[d\.actual, d\.min, d\.max\]\), \{ base: 'zero', bar: style === 'bar' \}\)/);
    assert.equal(/min = 0/.test(src), false, 'no bar-only zero');
  });
});

describe('screen-reader table in ChartFigure: capped on cards (and says so), complete in the viewer', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ date: `D${i}`, v: i }));
  const table = { columns: [{ key: 'date', label: 'Date' }, { key: 'v', label: 'V' }], rows };
  const render = (expanded: boolean) => html(createElement(ChartFigure, { title: 'T', summary: 'S', expanded, table }, createElement('div')));
  const bodyRows = (out: string) => (out.match(/<tr>/g)?.length ?? 0) - 1;
  test('card: the latest 100 rows, and the caption says it is partial and where to find all rows', () => {
    const out = render(false);
    assert.equal(bodyRows(out), 100);
    assert.match(out, /<caption>T data\. Showing the latest 100 of 150 rows\. Open full screen and choose Table for all rows\.<\/caption>/);
  });
  test('viewer: every row, no partial-data caption', () => {
    const out = render(true);
    assert.equal(bodyRows(out), 150);
    assert.match(out, /<caption>T data<\/caption>/);
  });
  test('a card with 100 rows or fewer is unchanged', () => {
    const small = html(createElement(ChartFigure, { title: 'T', summary: 'S', table: { ...table, rows: rows.slice(0, 30) } }, createElement('div')));
    assert.equal(bodyRows(small), 30);
    assert.match(small, /<caption>T data<\/caption>/);
  });
});
