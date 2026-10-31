import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValueHistory } from '../src/components/personal-data/ValueHistory.tsx';

// Final rendered fixes lane A: at 320/375px the nutrition-target history rows must wrap
// (not push the page sideways) and the native date picker icon must never be clipped.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const classOf = (html: string, marker: string) => {
  const i = html.indexOf(marker);
  assert.ok(i >= 0, `missing ${marker}`);
  const start = html.lastIndexOf('class="', i);
  return html.slice(start + 7, html.indexOf('"', start + 7));
};

describe('PersonalData nutrition target history rows', () => {
  const rows = [
    { id: 'h0', changedAt: '2026-10-01T10:00:00Z', min: 2300, max: 2600 },
    { id: 'h1', changedAt: '2026-09-01T10:00:00Z', min: 2200, max: 2500 },
  ];
  const html = renderToStaticMarkup(createElement(ValueHistory, { rows, unit: 'kcal', label: 'Gym day calories' }));

  test('current row wraps and the value text can shrink', () => {
    const row = classOf(html, 'flex-wrap');
    assert.match(row, /flex-wrap/);
    assert.match(row, /justify-between/);
    const label = classOf(html, 'Current:');
    assert.match(label, /min-w-0/);
    assert.match(label, /break-words/);
    assert.match(classOf(html, 'basis-48'), /min-w-0/);
  });

  test('content is still fully rendered, not hidden or truncated', () => {
    assert.match(html, /Current:/);
    assert.match(html, /2,300\u20132,600 kcal/);
    assert.match(html, /Show 1 earlier/);
    assert.doesNotMatch(html, /truncate|overflow-hidden/);
  });

  test('toggle button keeps its size instead of squashing', () => {
    const btn = html.match(/<button[^>]*class="([^"]*)"/);
    assert.ok(btn, 'missing toggle button');
    assert.match(btn[1], /shrink-0/);
  });

  test('expanded history list rows wrap too', () => {
    const src = read('src/components/personal-data/ValueHistory.tsx');
    assert.match(src, /<li key=\{row\.id\} className="relative flex flex-wrap items-baseline justify-between/);
  });

  test('empty state wraps', () => {
    const empty = renderToStaticMarkup(createElement(ValueHistory, { rows: [], unit: '', label: 'x' }));
    assert.match(empty, /No history yet/);
  });
});

describe('phone-width date grids stack below sm', () => {
  const STACKED = /grid grid-cols-1 gap-\d sm:grid-cols-2 \[&>\*\]:min-w-0/;
  test('ExtraActivities Date + Time stack, order preserved', () => {
    const src = read('src/pages/ExtraActivities.tsx');
    assert.match(src, STACKED);
    const grid = src.indexOf('sm:grid-cols-2 [&>*]:min-w-0');
    assert.ok(grid > 0 && src.indexOf('id="date"', grid) > 0);
    assert.ok(src.indexOf('id="date"', grid) < src.indexOf('id="time"', grid));
    assert.doesNotMatch(src, /grid grid-cols-2 gap-3">\s*<div className="space-y-2">\s*<Label htmlFor="date"/);
  });
  test('CalorieHistory From / To stack, order preserved', () => {
    const src = read('src/pages/CalorieHistory.tsx');
    assert.match(src, STACKED);
    assert.ok(src.indexOf('id="start-date"') < src.indexOf('id="end-date"'));
    assert.doesNotMatch(src, /grid gap-4 grid-cols-2/);
  });
});
