import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NAV_GROUPS, NAV_ITEMS, getNavSections } from '../src/app/navigation';
import { sheetVariants } from '../src/components/ui/sheet';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');
const drawer = read('src/components/layout/NavDrawer.tsx');
const item = read('src/components/layout/NavItem.tsx');
const sheet = read('src/components/ui/sheet.tsx');

const token = (name: string, from = 0) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css.slice(from))?.[1].trim();

// WCAG contrast from "H S% L%" triples.
const toRgb = (hsl: string): number[] => {
  const [h, s, l] = hsl.replace(/%/g, '').split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe('shared glass tokens', () => {
  test('every reusable token and utility exists', () => {
    for (const name of ['glass-surface', 'glass-border', 'glass-highlight', 'glow-accent', 'glass-ink', 'glass-scrim']) {
      expect(token(name)).toBeDefined();
    }
    for (const cls of ['.glass-panel', '.glass-edge-end', '.glass-scrim', '.glow-selection']) {
      expect(css).toContain(cls);
    }
  });

  test('the glow accent is the same orange as the dock accent', () => {
    expect(token('glow-accent')).toBe(token('dock-accent'));
    expect(token('glow-accent-foreground')).toBe(token('dock-accent-foreground'));
  });

  test('drawer text stays readable on the glass over a dimmed light page (worst case)', () => {
    const surface = toRgb(token('glass-surface')!);
    const alpha = Number(token('glass-surface-alpha'));
    // Light page (white) dimmed by the scrim, then the translucent glass on top.
    const scrim = Number(token('glass-scrim-alpha'));
    const behind = [1, 1, 1].map((c) => c * (1 - scrim));
    const glass = surface.map((c, i) => c * alpha + behind[i] * (1 - alpha));
    for (const ink of ['glass-ink', 'glass-ink-soft', 'glass-ink-muted']) {
      expect(contrast(toRgb(token(ink)!), glass)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('navigation drawer', () => {
  test('keeps every group heading, item and the owner-only visibility rule', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'Overview',
      'Log today',
      'Body & recovery',
      'Review & insights',
      'Help & records',
      'Admin',
    ]);
    expect(getNavSections(false).flatMap((s) => s.items)).toHaveLength(NAV_ITEMS.filter((i) => !i.ownerOnly).length);
    expect(getNavSections(true).flatMap((s) => s.items)).toHaveLength(NAV_ITEMS.length);
    expect(drawer).toContain('getNavSections(isOwner)');
    expect(drawer).toContain('group.hideLabel');
    expect(drawer).toContain('aria-label="Primary"');
  });

  test('uses the glass look, one gliding indicator and its own overlay', () => {
    expect(drawer).toContain('glass-panel');
    expect(drawer).toContain('overlayClassName="glass-scrim"');
    expect(drawer).toContain('useNavIndicator');
    expect(drawer).toContain('nav-indicator glow-selection');
    // Items no longer paint a solid orange rectangle.
    expect(item).not.toContain('bg-primary');
    expect(item).toContain('data-nav-to');
    expect(item).toContain('aria-[current=page]');
  });

  test('keeps focus return, escape / outside click (Radix) and a close control', () => {
    expect(drawer).toContain('onCloseAutoFocus={onCloseAutoFocus}');
    expect(drawer).toContain('SheetClose');
    expect(drawer).toContain('label="Close"');
  });

  test('indicator glides with transform only, and only when motion is allowed', () => {
    const m = /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.nav-indicator\[data-ready='true'\]\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('transition: transform');
    // Nothing outside that media query transitions the indicator.
    expect(css.replace(m![0], '')).not.toMatch(/\.nav-indicator\[data-ready='true'\]\s*\{[^}]*transition/);
  });

  test('drawer timing is scoped to the drawer; Sheet defaults are unchanged', () => {
    expect(css).toContain(".glass-drawer.glass-drawer[data-state='open']");
    const base = sheetVariants({ side: 'left' });
    expect(base).toContain('bg-background');
    expect(base).toContain('data-[state=open]:duration-500');
    expect(base).toContain('data-[state=closed]:duration-300');
    expect(sheet).toContain('overlayClassName');
    expect(sheet).toContain('bg-black/80'); // the shared overlay is still the default
  });
});
