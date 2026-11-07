import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card } from '../src/components/ui/card';
import { APP_VERSION } from '../src/lib/version';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');
const dashboard = read('src/pages/Dashboard.tsx');
const stats = read('src/components/StatsCards.tsx');

describe('dashboard panel surface (v1.9)', () => {
  test('the release shows version 1.19', () => {
    expect(APP_VERSION).toBe('1.19');
  });

  test('panel tokens exist for both themes so chart cards can reuse them', () => {
    for (const name of ['panel-fill-top', 'panel-fill-bottom', 'panel-edge', 'panel-highlight', 'panel-shadow', 'panel-well']) {
      expect(css.match(new RegExp(`--${name}:`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  test('the look is opt-in: a plain Card is unchanged, and carries only the bare data-card hook', () => {
    const html = renderToStaticMarkup(createElement(Card, null, 'x'));
    expect(html).toContain('data-card=""');
    expect(html).toContain('rounded-lg border bg-card text-card-foreground shadow-sm');
    expect(html).not.toContain('panel-');
  });

  test('since v1.15 the panel look is app-wide: no page wrapper is needed any more', () => {
    expect(dashboard).not.toContain('dashboard-surface');
    expect(css).not.toContain('.dashboard-surface');
    expect(css).toContain('[data-card][data-card]:not([data-card-tone]) {');
  });

  test('orange appears only on interactive states: linked tiles get panel-link, static cards do not', () => {
    expect(stats).toContain('panel-link');
    expect(stats.match(/panel-link/g)?.length).toBe(1);
    const linkRules = css.match(/\.panel-link:hover \[data-card\][\s\S]*?\}/)?.[0] ?? '';
    expect(linkRules).toContain('--glow-accent');
    const surface = css.match(/\.panel-surface-look \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(surface).not.toContain('glow-accent');
  });

  test('hover lift is limited to devices that hover, and the link keeps its keyboard focus ring', () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.panel-link:hover \[data-card\]/);
    expect(stats).toContain('focus-visible:ring-2');
  });
});
