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
  test('the release shows version 1.11', () => {
    expect(APP_VERSION).toBe('1.11');
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

  test('only the dashboard page turns the wrapper on, and the restyle starts at 768px', () => {
    expect(dashboard).toContain('<PageContainer className="dashboard-surface">');
    const media = css.indexOf('@media (min-width: 768px) {\n    .dashboard-surface [data-card]');
    expect(media).toBeGreaterThan(-1);
    // No unscoped rule restyles every Card in the app.
    expect(css).not.toMatch(/(^|\n)\s*\[data-card\]\s*\{/);
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
    expect(css).toContain('@media (min-width: 768px) and (hover: hover)');
    expect(stats).toContain('focus-visible:ring-2');
  });
});
