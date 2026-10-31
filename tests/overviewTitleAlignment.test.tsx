import { describe, test, expect } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Card, CardHeader, CardTitle } from '../src/components/ui/card';
import { MetricOverviewCard } from '../src/components/MetricOverviewCard';

// Sibling card headings (Log / Overview / History) must share one size AND one line height so they line up at 768px.
// Cause of the old mismatch: tailwind-merge drops an earlier `leading-none` when a later `text-lg` class is added by hand,
// so hand-sized titles got a 28px line while role-sized ones got `leading-none`. The fix is to use the Card size role.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const h3Class = (html: string, marker: string) => {
  const i = html.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<h3 class="', i);
  return html.slice(start + 11, html.indexOf('"', start + 11)).split(' ');
};

describe('Weight / Waist / Sleep card headings share one size role and line height', () => {
  test('a hand-set text-lg loses leading-none (the cause), the size role keeps it', () => {
    const byHand = renderToStaticMarkup(createElement(Card, null, createElement(CardTitle, { className: 'flex items-center gap-2 text-lg' }, 'Log')));
    const byRole = renderToStaticMarkup(createElement(Card, { titleSize: 'chart' }, createElement(CardTitle, { className: 'flex items-center gap-2' }, 'Log')));
    expect(h3Class(byHand, 'Log')).not.toContain('leading-none');
    expect(h3Class(byRole, 'Log')).toContain('leading-none');
    expect(h3Class(byRole, 'Log')).toContain('text-lg');
  });

  test('Log, Overview and History headings render with identical type classes', () => {
    const log = renderToStaticMarkup(createElement(Card, { titleSize: 'chart' }, createElement(CardHeader, null, createElement(CardTitle, { className: 'flex items-center gap-2' }, 'Log Weight'))));
    const history = renderToStaticMarkup(createElement(Card, { titleSize: 'chart' }, createElement(CardHeader, null, createElement(CardTitle, null, 'Weight History'))));
    const overview = renderToStaticMarkup(createElement(MetricOverviewCard, {
      title: 'Weight Overview', latestLabel: 'Latest', latest: 80, unit: 'kg', totalEntries: 1, deltas: [], emptyText: 'x',
    }));
    const type = (classes: string[]) => classes.filter((c) => /^(text-(lg|xl|2xl|base)|leading-\w+|font-\w+|tracking-\w+)$/.test(c)).sort().join(' ');
    const expected = 'font-semibold leading-none text-lg tracking-tight';
    expect(type(h3Class(log, 'Log Weight'))).toBe(expected);
    expect(type(h3Class(overview, 'Weight Overview'))).toBe(expected);
    expect(type(h3Class(history, 'Weight History'))).toBe(expected);
  });

  for (const page of ['Weight', 'Waist', 'Sleep']) {
    test(`${page}: every card uses the size role, no title sets its own text size`, () => {
      const src = read(`src/pages/${page}.tsx`);
      expect(src).not.toMatch(/<CardTitle[^>]*text-(base|lg|xl|2xl)/);
      expect(src).not.toMatch(/<Card>/);
      const cards = src.match(/<Card [^>]*>|<Card>/g) ?? [];
      expect(cards.length).toBeGreaterThanOrEqual(2);
      for (const c of cards) expect(c).toContain('titleSize="chart"');
    });
  }
});
