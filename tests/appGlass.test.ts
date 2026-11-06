import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buttonVariants } from '../src/components/ui/button';
import { Card } from '../src/components/ui/card';
import { TableRow } from '../src/components/ui/table';

// v1.15: the premium glass look is app-wide. It lives in shared tokens and classes (src/index.css) that the primitives opt into by default.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');
const ui = (name: string) => read(`src/components/ui/${name}.tsx`);
const block = (selector: string) => {
  const i = css.indexOf(selector);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('\n  }', i) + 4);
};

describe('cards: the panel surface is global', () => {
  test('every [data-card] takes the panel look, a toned card keeps its own fill and border, a card in a card is sunken', () => {
    expect(block('[data-card][data-card]:not([data-card-tone]) {')).toContain('panel-surface-look');
    const tone = block('[data-card][data-card][data-card-tone] {');
    expect(tone).toContain('box-shadow');
    expect(tone).not.toMatch(/background|border-color/);
    expect(block('[data-card][data-card] [data-card][data-card]:not([data-card-tone]) {')).toContain('--panel-well');
  });
  test('the Card primitive still renders as before, with the bare hook', () => {
    const html = renderToStaticMarkup(createElement(Card, null, 'x'));
    expect(html).toContain('data-card=""');
    expect(html).toContain('rounded-lg border bg-card text-card-foreground shadow-sm');
  });
  test('the three status-tinted Gym cards and the recent/selected one keep their own colours (data-card-tone)', () => {
    expect(read('src/pages/Gym.tsx').match(/data-card-tone=""/g)?.length).toBe(4);
  });
  test('static cards never react to the pointer: the only [data-card] hover rule is the linked-tile one', () => {
    const hovers = (css.match(/[^\n{}]+\{/g) ?? []).filter((sel) => sel.includes('[data-card]') && sel.includes(':hover'));
    expect(hovers.length).toBe(1);
    expect(hovers[0]).toContain('.panel-link:hover');
  });
});

describe('tokens exist for both themes', () => {
  test('panel, raised-surface and backdrop tokens are defined for light and dark', () => {
    for (const name of ['panel-fill-top', 'panel-fill-bottom', 'panel-edge', 'panel-highlight', 'panel-shadow', 'panel-well', 'surface-raised-alpha', 'backdrop-wash-alpha']) {
      expect(css.match(new RegExp(`--${name}:`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
  test('the classes the primitives use are defined', () => {
    for (const cls of ['.field-glass', '.surface-raised', '.overlay-glass', '.btn-solid-glass', '.btn-primary-glass', '.btn-outline-glass', '.btn-secondary-glass', '.segmented-glass', '.table-glass', '.app-backdrop', '.panel-well', '.panel-surface']) {
      expect(css).toContain(cls);
    }
  });
});

describe('primitives opt in by default, and keep focus rings and sizes', () => {
  test('inputs, text areas and select triggers are glass fields; the focus ring classes are still there', () => {
    expect(ui('input')).toContain('"field-glass flex h-10 w-full [@media(pointer:coarse)]:min-h-11');
    expect(ui('input')).toContain('focus-visible:ring-2 focus-visible:ring-ring');
    expect(ui('textarea')).toContain('field-glass');
    expect(ui('textarea')).toContain('focus-visible:ring-2');
    expect(ui('select')).toContain('"field-glass flex h-10 w-full [@media(pointer:coarse)]:min-h-11');
    expect(ui('select')).toContain('focus:ring-2 focus:ring-ring');
  });
  test('field fill and edge keep the shared tokens: the border colour is still border-input (3:1 against the surface)', () => {
    expect(ui('input')).toContain('border border-input');
    expect(block('.field-glass.field-glass {')).not.toMatch(/(^|\n)\s*border-color:/);
  });
  test('dropdown, select list, popover, tooltip, dialog and alert dialog are raised glass; dialogs dim with a light blur', () => {
    for (const name of ['dropdown-menu', 'select', 'popover', 'tooltip', 'dialog', 'alert-dialog']) expect(ui(name)).toContain('surface-raised');
    for (const name of ['dialog', 'alert-dialog']) expect(ui(name)).toContain('overlay-glass');
  });
  test('navigation is not restyled: drawer, dock and bottom bar use none of the new classes', () => {
    for (const f of ['NavDrawer', 'LiquidDock', 'BottomNav', 'NavItem']) {
      expect(read(`src/components/layout/${f}.tsx`)).not.toMatch(/surface-raised|field-glass|panel-surface|btn-\w+-glass|segmented-glass/);
    }
    expect(read('src/components/ui/sheet.tsx')).not.toContain('surface-raised');
  });
  test('tables: rows only get a hover when they are interactive; the header and cell sizes are unchanged', () => {
    const row = renderToStaticMarkup(createElement('table', null, createElement('tbody', null, createElement(TableRow, null))));
    expect(row).not.toMatch(/(^|\s|")hover:bg-muted/);
    expect(ui('table')).toContain('data-[interactive]:[@media(hover:hover)]:hover:bg-muted/50');
    expect(ui('table')).toContain('h-12 px-4');
    expect(ui('table')).toContain('p-4 align-middle');
  });
});

describe('buttons: primary stays orange, destructive stays destructive', () => {
  test('default = bg-primary, destructive = bg-destructive, each with its own hover and pressed colour', () => {
    const primary = buttonVariants({ variant: 'default' });
    expect(primary).toContain('bg-primary');
    expect(primary).toContain('text-primary-foreground');
    expect(primary).toContain('hover:bg-primary-hover');
    expect(primary).toContain('btn-primary-glass');
    const destructive = buttonVariants({ variant: 'destructive' });
    expect(destructive).toContain('bg-destructive');
    expect(destructive).toContain('text-destructive-foreground');
    expect(destructive).not.toContain('bg-primary');
    expect(destructive).not.toContain('btn-primary-glass');
  });
  test('outline and secondary keep their hover colours; sizes (44px touch targets) are unchanged', () => {
    expect(buttonVariants({ variant: 'outline' })).toContain('hover:bg-accent');
    expect(buttonVariants({ variant: 'secondary' })).toContain('hover:bg-secondary-hover');
    expect(buttonVariants({ size: 'default' })).toContain('[@media(pointer:coarse)]:min-h-11');
    expect(buttonVariants({ size: 'touch' })).toContain('h-11 min-w-11');
  });
  test('the orange glow only appears on hover of the primary button, and the reduced-motion safety net is still in place', () => {
    expect(block('.btn-solid-glass {')).not.toContain('glow-accent');
    expect(css).toMatch(/\.btn-primary-glass:hover[^{]*\{[^}]*glow-accent/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
