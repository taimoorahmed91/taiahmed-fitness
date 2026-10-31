import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { combineViews, joinLabels, summarizeTables, tableView } from '../src/components/feedback/tableView';
import { REPORT_TABLES, REPORT_TABLE_LABELS, resolveReportData, type ReportTable } from '../src/components/feedback/reportSections';
import { PartialDataNotice } from '../src/components/feedback/PartialDataNotice';
import { SectionUnavailable } from '../src/components/feedback/SectionUnavailable';
import type { SharedTableState } from '../src/lib/sharedData';

// Weight / Waist / Sleep / Reports data states: loading, first-load error, failed refresh over kept rows, true empty.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const unescape = (html: string) => html.replace(/&#x27;/g, "'");
const state = (phase: SharedTableState['phase'], refreshFailed = false): SharedTableState => ({
  phase,
  loadFailed: phase === 'error',
  refreshFailed,
  error: phase === 'error' || refreshFailed ? new Error('Failed to fetch') : null,
});
const all = (s: SharedTableState): Record<ReportTable, SharedTableState> =>
  Object.fromEntries(REPORT_TABLES.map((t) => [t, s])) as Record<ReportTable, SharedTableState>;

describe('tableView', () => {
  test('maps phases; a failed first load is an error, never ready', () => {
    assert.equal(tableView(state('loading')), 'loading');
    assert.equal(tableView(state('idle')), 'loading');
    assert.equal(tableView(state('error')), 'error');
    assert.equal(tableView(state('ready')), 'ready');
    // Rows kept after a failed refresh are still ready (the page keeps them and adds a notice).
    assert.equal(tableView(state('ready', true)), 'ready');
  });
  test('combined sections: an error shows at once, even while others still load', () => {
    assert.equal(combineViews(['loading', 'error']), 'error');
    assert.equal(combineViews(['ready', 'loading']), 'loading');
    assert.equal(combineViews(['ready', 'ready']), 'ready');
  });
  test('labels read as plain sentences', () => {
    assert.equal(joinLabels(['sleep']), 'sleep');
    assert.equal(joinLabels(['meals', 'sleep']), 'meals and sleep');
    assert.equal(joinLabels(['meals', 'weight', 'sleep']), 'meals, weight and sleep');
  });
  test('summary separates never-loaded, stale and loading', () => {
    const s = summarizeTables([
      { key: 'a', label: 'A', state: state('error') },
      { key: 'b', label: 'B', state: state('ready', true) },
      { key: 'c', label: 'C', state: state('loading') },
      { key: 'd', label: 'D', state: state('ready') },
    ]);
    assert.deepEqual(s.failed.map((t) => t.key), ['a']);
    assert.deepEqual(s.stale.map((t) => t.key), ['b']);
    assert.deepEqual(s.loading.map((t) => t.key), ['c']);
  });
});

describe('Reports sections', () => {
  test('everything loading: every section loading, nothing failed', () => {
    const d = resolveReportData(all(state('loading')));
    assert.ok(Object.values(d.sections).every((s) => s.view === 'loading'));
    assert.equal(d.loading, true);
    assert.deepEqual(d.failed, []);
  });
  test('one failed table blocks only the sections that need it', () => {
    const d = resolveReportData({ ...all(state('ready')), sleep: state('error') });
    assert.deepEqual(d.failed, ['sleep']);
    for (const blocked of ['statSleep', 'charts', 'insights', 'share', 'digest'] as const) {
      assert.equal(d.sections[blocked].view, 'error', blocked);
      assert.deepEqual(d.sections[blocked].missing, ['sleep'], blocked);
    }
    for (const fine of ['statCalories', 'statWorkouts', 'statWeight', 'recomposition'] as const) {
      assert.equal(d.sections[fine].view, 'ready', fine);
    }
  });
  test('a failed refresh keeps every section ready and is reported as stale', () => {
    const d = resolveReportData({ ...all(state('ready')), meals: state('ready', true) });
    assert.ok(Object.values(d.sections).every((s) => s.view === 'ready'));
    assert.deepEqual(d.stale, ['meals']);
    assert.deepEqual(d.failed, []);
  });
  test('an error is not held back by tables that are still loading', () => {
    const d = resolveReportData({ ...all(state('loading')), weight: state('error') });
    assert.equal(d.sections.statWeight.view, 'error');
    assert.equal(d.sections.statSleep.view, 'loading');
    assert.equal(d.sections.share.view, 'error');
  });
  test('every table has a plain label', () => {
    for (const t of REPORT_TABLES) assert.ok(REPORT_TABLE_LABELS[t].length > 0);
  });
});

describe('feedback components', () => {
  test('PartialDataNotice says what failed, is an alert, and offers Try again', () => {
    const out = unescape(renderToStaticMarkup(createElement(PartialDataNotice, { failed: ['sleep', 'weight'], stale: [], onRetry: () => {} })));
    assert.match(out, /role="alert"/);
    assert.ok(out.includes("Couldn't load your sleep and weight."));
    assert.ok(out.includes('Try again'));
    assert.equal(/no data|0h/i.test(out), false);
  });
  test('PartialDataNotice for kept rows is a status that says the old rows stay', () => {
    const out = unescape(renderToStaticMarkup(createElement(PartialDataNotice, { failed: [], stale: ['meals'], onRetry: () => {} })));
    assert.match(out, /role="status"/);
    assert.ok(out.includes("Couldn't refresh your meals."));
    assert.ok(out.includes('Showing what we loaded earlier.'));
  });
  test('PartialDataNotice renders nothing when all is well', () => {
    assert.equal(renderToStaticMarkup(createElement(PartialDataNotice, { failed: [], stale: [], onRetry: () => {} })), '');
  });
  test('SectionUnavailable is fixed-height and never claims "no data"', () => {
    const out = renderToStaticMarkup(createElement(SectionUnavailable, { title: 'Report charts are paused', description: "Needs your sleep, which didn't load.", minHeightClassName: 'min-h-[22rem]' }));
    assert.ok(out.includes('min-h-[22rem]'));
    assert.ok(out.includes('Report charts are paused'));
    assert.equal(/no data|no entries/i.test(out), false);
  });
});

describe('page wiring', () => {
  for (const [file, table] of [['Weight', 'weight'], ['Waist', 'waist'], ['Sleep', 'sleep']] as const) {
    test(`${file} reads the shared table state and never keys the empty copy on the old loading flag`, () => {
      const src = read(`src/pages/${file}.tsx`);
      assert.ok(src.includes(`useSharedTableState('${table}')`));
      assert.match(src, /view === 'error'/);
      assert.match(src, /<StaleDataNotice/);
      assert.match(src, /<DataLoadError/);
      assert.equal(/\bloading\b\s*\?/.test(src), false);
    });
  }
  test('Reports gates every computed section on its tables and keeps one retry', () => {
    const src = read('src/pages/Reports.tsx');
    assert.match(src, /resolveReportData\(/);
    assert.match(src, /<PartialDataNotice/);
    for (const s of ['digest', 'charts', 'recomposition', 'share', 'insights']) assert.ok(src.includes(`sections.${s}.view`), s);
    // Feedback is on the page, not a toast.
    assert.equal(/toast\.(error|warning)\([^)]*(load|refresh)/i.test(src), false);
  });
});
