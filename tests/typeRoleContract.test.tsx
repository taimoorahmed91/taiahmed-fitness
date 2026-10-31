import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Card, CardTitle, CARD_TITLE_SIZE_CLASS, HEADING_LEVEL_SIZE } from '../src/components/ui/card';
import { PageSection } from '../src/components/layout/Page';

// F65/F68: heading level and title size are set through the primitives (Card / CardTitle / PageSection),
// on one shared scale, instead of each component repeating `text-lg` by hand.

const html = (node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const title = (card: Record<string, unknown>, titleProps: Record<string, unknown> = {}) =>
  html(createElement(Card, card, createElement(CardTitle, titleProps, 'T')));

describe('CardTitle size roles', () => {
  test('the default is unchanged: text-2xl, h3', () => {
    const out = title({});
    assert.match(out, /^<div[^>]*><h3 class="text-2xl font-semibold leading-none tracking-tight">T<\/h3><\/div>$/);
  });
  test('Card titleSize sets the size for every title inside it', () => {
    for (const [role, cls] of Object.entries(CARD_TITLE_SIZE_CLASS)) {
      const out = title({ titleSize: role });
      assert.match(out, new RegExp(`<h3 class="${cls} font-semibold`), role);
    }
  });
  test('CardTitle size overrides the card, and an explicit text-* class still wins over both', () => {
    assert.match(title({ titleSize: 'chart' }, { size: 'compact' }), /class="text-base /);
    const out = title({ titleSize: 'chart' }, { className: 'text-3xl' });
    assert.match(out, /class="[^"]*\btext-3xl\b/);
    assert.equal(out.includes('text-2xl'), false);
    assert.equal(out.includes('text-lg'), false);
  });
  test('heading level and size are independent, so an h2 card can still be chart-sized', () => {
    assert.match(title({ headingLevel: 'h2', titleSize: 'chart' }), /<h2 class="text-lg /);
  });
  test('the level-to-size map covers every heading and never gets smaller as the level gets higher', () => {
    const order = ['compact', 'chart', 'section', 'default'];
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
    for (const level of levels) assert.ok(order.includes(HEADING_LEVEL_SIZE[level]), level);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(order.indexOf(HEADING_LEVEL_SIZE[levels[i - 1]]) >= order.indexOf(HEADING_LEVEL_SIZE[levels[i]]), levels[i]);
    }
  });
});

describe('PageSection heading level', () => {
  const section = (props: Record<string, unknown> = {}) => html(createElement(PageSection, { title: 'Trends', ...props }, 'body'));
  test('h2 text-xl by default (unchanged)', () => {
    assert.match(section(), /<h2 id="[^"]+" class="flex items-center gap-2 font-semibold tracking-tight text-xl">Trends<\/h2>/);
  });
  test('headingLevel moves the element and its size together', () => {
    assert.match(section({ headingLevel: 'h3' }), /<h3 [^>]*class="[^"]*text-lg">Trends<\/h3>/);
    assert.match(section({ headingLevel: 'h4' }), /<h4 [^>]*class="[^"]*text-base">Trends<\/h4>/);
  });
  test('the section is labelled by whichever heading it uses, visible or screen-reader only', () => {
    for (const props of [{}, { headingLevel: 'h3' }, { hideTitle: true, headingLevel: 'h3' }]) {
      const out = section(props);
      const labelled = /aria-labelledby="([^"]+)"/.exec(out)?.[1];
      assert.ok(labelled, 'has aria-labelledby');
      assert.ok(out.includes(`id="${labelled}"`), 'heading carries the id');
    }
    assert.match(section({ hideTitle: true, headingLevel: 'h3' }), /<h3 [^>]*class="sr-only"/);
  });
});

describe('chart cards use the primitive instead of repeating text-lg', () => {
  const files = [
    'src/components/TrendChart.tsx', 'src/components/MacroTargetChart.tsx', 'src/components/MealTimeChart.tsx',
    'src/components/BodyRecompositionCard.tsx', 'src/components/ReportCharts.tsx',
    'src/components/charts/WeeklyBarChart.tsx', 'src/components/charts/DeltaChart.tsx',
  ];
  for (const file of files) {
    test(file, () => {
      const src = read(file);
      assert.match(src, /<Card [^>]*titleSize="chart"/);
      assert.equal(/<CardTitle[^>]*text-lg/.test(src), false, 'no hand-set text-lg on CardTitle');
    });
  }
});
