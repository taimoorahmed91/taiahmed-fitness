import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../src/components/ui/card';
import { Skeleton } from '../src/components/ui/skeleton';
import { buttonVariants } from '../src/components/ui/button';
import { dialogContentVariants } from '../src/components/ui/dialog';
import { sheetVariants } from '../src/components/ui/sheet';
import { cn } from '../src/lib/utils';

// Design-system guards for the shared UI defaults (button, card, dialog, sheet, alert-dialog,
// skeleton, sonner) and the two forms that depend on them. Contrast numbers are computed from the
// real CSS tokens and the real Button class strings, so a regression fails here.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const css = read('src/index.css');
const tailwind = read('tailwind.config.ts');

// ---------------------------------------------------------------- colour maths

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector} block`);
  const end = css.indexOf('\n  }', start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const themes: Record<string, Record<string, string>> = { light: block(':root'), dark: block('.dark') };

type RGB = [number, number, number];
function toRgb(hsl: string): RGB {
  const m = hsl.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  assert.ok(m, `token is not a plain "H S% L%" triple: ${hsl}`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** What the eye sees when `fg` is painted at `alpha` over `bg`. */
const composite = (fg: RGB, bg: RGB, alpha: number): RGB => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;

// ------------------------------------------------- button states from real source

const buttonSrc = read('src/components/ui/button.tsx');
const variantBlock = buttonSrc.slice(buttonSrc.indexOf('variant: {'), buttonSrc.indexOf('size: {'));
const variants = new Map<string, string[]>();
for (const m of variantBlock.matchAll(/(\w+):\s*"([^"]+)"/g)) variants.set(m[1], m[2].split(/\s+/));

type State = 'base' | 'hover' | 'active';
/** Pull the colour classes of each state out of a variant's class list. */
function stateColours(classes: string[]) {
  const out: Record<State, { bg?: string; alpha?: number; text?: string }> = { base: {}, hover: {}, active: {} };
  for (const raw of classes) {
    const cls = raw.replace('[@media(hover:hover)]:', '');
    let state: State = 'base';
    let c = cls;
    if (c.startsWith('hover:')) { state = 'hover'; c = c.slice(6); }
    else if (c.startsWith('active:')) { state = 'active'; c = c.slice(7); }
    else if (c.includes(':') || c.startsWith('[')) continue; // focus-visible:, disabled:, [&_svg]:, motion-*: ...
    const bg = c.match(/^bg-([a-z-]+?)(?:\/(\d+))?$/);
    if (bg) { out[state].bg = bg[1]; out[state].alpha = bg[2] ? Number(bg[2]) / 100 : 1; continue; }
    const text = c.match(/^text-([a-z-]+)$/);
    if (text && text[1] !== 'sm') out[state].text = text[1];
  }
  return out;
}

const SURFACES = ['background', 'card', 'popover'];

/** Rendered (composited) text/background pair for a state, over a given page surface. */
function renderedPair(theme: Record<string, string>, classes: string[], state: State, surface: string) {
  const c = stateColours(classes);
  const pick = <K extends 'bg' | 'text'>(key: K) => (state === 'active' ? c.active[key] ?? c.hover[key] ?? c.base[key] : state === 'hover' ? c.hover[key] ?? c.base[key] : c.base[key]);
  const bgToken = pick('bg');
  const textToken = pick('text') ?? 'foreground';
  assert.ok(theme[textToken], `unknown text token "${textToken}"`);
  const surfaceRgb = toRgb(theme[surface]);
  let bg: RGB = surfaceRgb;
  if (bgToken) {
    assert.ok(theme[bgToken], `unknown background token "${bgToken}"`);
    const alpha = state === 'base' ? c.base.alpha : state === 'hover' ? c.hover.alpha ?? c.base.alpha : c.active.alpha ?? c.hover.alpha ?? c.base.alpha;
    bg = composite(toRgb(theme[bgToken]), surfaceRgb, alpha ?? 1);
  }
  return { bg, text: toRgb(theme[textToken]), bgToken, textToken };
}

describe('button: base / hover / active text contrast >= 4.5 in both themes on every surface', () => {
  test('parsed all six variants', () => {
    assert.deepEqual([...variants.keys()].sort(), ['default', 'destructive', 'ghost', 'link', 'outline', 'secondary']);
  });
  for (const [themeName, theme] of Object.entries(themes)) {
    for (const [variant, classes] of variants) {
      for (const surface of SURFACES) {
        for (const state of ['base', 'hover', 'active'] as State[]) {
          test(`${themeName} / ${variant} / ${state} on ${surface}`, () => {
            const p = renderedPair(theme, classes, state, surface);
            const r = ratio(p.bg, p.text);
            assert.ok(r >= 4.5, `${p.textToken} on ${p.bgToken ?? surface} is ${r.toFixed(2)}:1`);
          });
        }
      }
    }
  }

  for (const [variant, role] of [['default', 'primary'], ['destructive', 'destructive'], ['secondary', 'secondary']]) {
    test(`${variant}: hover and active use solid -hover / -active tokens and look different from base`, () => {
      const c = stateColours(variants.get(variant)!);
      assert.equal(c.base.alpha, 1);
      assert.equal(c.hover.bg, `${role}-hover`);
      assert.equal(c.active.bg, `${role}-active`);
      assert.equal(c.hover.alpha, 1);
      assert.equal(c.active.alpha, 1);
      for (const [themeName, theme] of Object.entries(themes)) {
        const base = toRgb(theme[role]);
        assert.ok(ratio(base, toRgb(theme[`${role}-hover`])) >= 1.1, `${themeName} ${variant} hover too close to base`);
        assert.ok(ratio(toRgb(theme[`${role}-hover`]), toRgb(theme[`${role}-active`])) >= 1.1, `${themeName} ${variant} active too close to hover`);
      }
    });
  }

  test('the compositing check really catches the old opacity states (sanity)', () => {
    // Old Button: bg-primary/90 on hover over a light page, bg-destructive/80 on press in dark.
    const light = themes.light;
    const dark = themes.dark;
    const oldHover = composite(toRgb(light.primary), toRgb(light.background), 0.9);
    assert.ok(ratio(oldHover, toRgb(light['primary-foreground'])) < 4.5);
    const oldPress = composite(toRgb(dark.destructive), toRgb(dark.background), 0.8);
    assert.ok(ratio(oldPress, toRgb(dark['destructive-foreground'])) < 4.5);
  });

  test('link variant text (text-primary) is >= 4.5 on background, card and popover', () => {
    for (const [themeName, theme] of Object.entries(themes)) {
      for (const s of SURFACES) assert.ok(ratio(toRgb(theme.primary), toRgb(theme[s])) >= 4.5, `${themeName} primary on ${s}`);
    }
  });

  test('no opacity modifiers on interactive colours, and busy no longer fades', () => {
    assert.deepEqual(buttonSrc.match(/(?:hover|active):bg-[a-z-]+\/\d+/g) ?? [], []);
    assert.equal(/aria-busy:opacity/.test(buttonSrc), false);
    // disabled controls may fade (exempt from contrast rules); nothing else may.
    assert.ok(/disabled:opacity-50/.test(buttonSrc));
    assert.ok(!/(?:^|\s)opacity-\d+/.test(variantBlock));
  });

  test('the class output keeps the 44px coarse-pointer floor for text and icon sizes', () => {
    assert.match(buttonVariants({ size: 'default' }), /\[@media\(pointer:coarse\)\]:min-h-11/);
    assert.match(buttonVariants({ size: 'icon' }), /\[@media\(pointer:coarse\)\]:min-w-11/);
  });
});

describe('interaction tokens are defined in both themes and registered in Tailwind', () => {
  for (const role of ['primary', 'secondary', 'destructive']) {
    for (const state of ['hover', 'active']) {
      test(`--${role}-${state}`, () => {
        for (const theme of Object.values(themes)) assert.ok(theme[`${role}-${state}`], `missing --${role}-${state}`);
        assert.ok(tailwind.includes(`'hsl(var(--${role}-${state}))'`), `tailwind.config.ts missing ${role}-${state}`);
      });
    }
  }
});

describe('opacity-based interaction states cannot come back', () => {
  // Existing offender outside the shared-default lane; remove from this list when it is fixed.
  const PENDING = new Set(['src/components/ui/badge.tsx']);
  test('no solid on-colour fill (bg-X + text-X-foreground) uses hover:/active: bg opacity anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      if (PENDING.has(file)) continue;
      read(file).split('\n').forEach((line, i) => {
        if (/text-(?:primary|destructive|secondary)-foreground/.test(line) && /(?:hover|active):bg-(?:primary|destructive|secondary)\/\d+/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });
  test('shared UI and the two forms use no opacity on hover/active backgrounds at all', () => {
    for (const file of SHARED_FILES) {
      assert.deepEqual(read(file).match(/(?:hover|active):(?:\S*:)?bg-[a-z-]+\/\d+/g) ?? [], [], file);
    }
  });
});

// ----------------------------------------------------------------- file helpers

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(tsx|ts)$/.test(name)) out.push(rel);
  }
  return out;
}

const SHARED_FILES = [
  'src/components/ui/button.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/alert-dialog.tsx',
  'src/components/ui/skeleton.tsx',
  'src/components/ui/sonner.tsx',
  'src/components/NotificationScheduleForm.tsx',
  'src/components/DailyNoteForm.tsx',
];

// ------------------------------------------------------------------------- Card

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('card defaults', () => {
  test('padding comes from the shared token: 16px phone, 24px sm and up', () => {
    assert.match(css, /--card-pad:\s*1rem;/);
    assert.match(css, /@media \(min-width: 640px\)\s*{\s*:root\s*{[^}]*--card-pad:\s*1\.5rem;/);
    for (const el of [CardHeader, CardContent, CardFooter]) {
      const out = html(createElement(el, { className: 'x' }));
      assert.match(out, /p-\[var\(--card-pad\)\]/);
    }
  });

  test('source has no default fixed p-6 (a bare p-6 would ignore the phone size)', () => {
    const src = read('src/components/ui/card.tsx');
    assert.equal(/["'\s]p-6\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  });

  test("a caller's own p-* class still replaces the default padding (back-compat)", () => {
    const out = html(createElement(CardContent, { className: 'p-4' }));
    assert.ok(!out.includes('--card-pad'), out);
    assert.match(out, /class="p-4"/);
    const header = html(createElement(CardHeader, { className: 'p-0' }));
    assert.ok(!header.includes('--card-pad'), header);
    // pt-0 survives when only the bottom is customised, like before.
    assert.match(html(createElement(CardContent, { className: 'pb-2' })), /p-\[var\(--card-pad\)\] pt-0 pb-2/);
  });

  test('one consistent shadow on the card shell', () => {
    const out = html(createElement(Card, null));
    assert.match(out, /shadow-sm/);
    assert.ok(!/shadow-(?:md|lg|xl|2xl)/.test(out));
  });

  test('CardTitle: h3 by default (unchanged), h2 via Card headingLevel, any tag via `as`', () => {
    assert.match(html(createElement(Card, null, createElement(CardTitle, null, 'T'))), /<h3 /);
    assert.match(html(createElement(Card, { headingLevel: 'h2' }, createElement(CardTitle, null, 'T'))), /<h2 /);
    assert.match(html(createElement(Card, { headingLevel: 'h2' }, createElement(CardTitle, { as: 'h4' }, 'T'))), /<h4 /);
    assert.match(html(createElement(CardTitle, { as: 'p' }, 'T')), /<p /);
    // outside any Card it still renders (back-compat)
    assert.match(html(createElement(CardTitle, null, 'T')), /<h3 /);
  });

  test('CardTitle is not hard-wired to <h3 in source', () => {
    assert.equal(/<h3\b/.test(read('src/components/ui/card.tsx')), false);
  });
});

// --------------------------------------------------------- Dialog / Sheet / Alert

describe('dialog defaults are bounded, scrollable and phone-safe', () => {
  for (const layout of [undefined, 'default', 'scroll', 'mobile-full'] as const) {
    test(`dialog layout=${layout ?? '(none)'}`, () => {
      const c = dialogContentVariants(layout ? { layout } : {});
      assert.match(c, /max-h-\[calc\(100dvh-2rem\)\]|h-\[100dvh\]/, 'bounded by dvh');
      assert.match(c, /overflow-y-auto/);
      assert.match(c, /overscroll-contain/);
      assert.ok(!/\b[\w:-]*(?:max-h|h)-\[?\d+vh\]?/.test(c), 'no plain vh');
    });
  }
  test('default and scroll keep a 12px gutter each side on phones, mobile-full is edge to edge until sm', () => {
    for (const layout of ['default', 'scroll'] as const) assert.match(dialogContentVariants({ layout }), /w-\[calc\(100%-1\.5rem\)\]/);
    const full = dialogContentVariants({ layout: 'mobile-full' });
    assert.match(full, /\bw-full\b/);
    assert.match(full, /sm:w-\[calc\(100%-1\.5rem\)\]/);
  });
  test('padding uses the shared overlay token and callers can still override it', () => {
    assert.match(dialogContentVariants(), /p-\[var\(--overlay-pad\)\]/);
    assert.ok(!cn(dialogContentVariants(), 'p-0').includes('overlay-pad'));
    assert.match(cn(dialogContentVariants(), 'sm:max-w-md'), /sm:max-w-md/);
    assert.match(cn(dialogContentVariants(), 'overflow-hidden'), /overflow-hidden/);
  });
  test('the built-in close button keeps its 44px touch target and the title leaves room for it', () => {
    const closeSrc = read('src/components/ui/close-button.tsx');
    assert.match(closeSrc, /\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11/);
    assert.match(read('src/components/ui/dialog.tsx'), /\[@media\(pointer:coarse\)\]:pr-12/);
    assert.match(read('src/components/ui/sheet.tsx'), /\[@media\(pointer:coarse\)\]:pr-12/);
  });
});

describe('sheet defaults are bounded and scrollable', () => {
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    for (const layout of [undefined, 'default', 'dvh', 'mobile-full'] as const) {
      test(`sheet side=${side} layout=${layout ?? '(none)'}`, () => {
        const c = sheetVariants({ side, ...(layout ? { layout } : {}) });
        assert.match(c, /(?:max-h|h)-\[100dvh\]/, 'bounded by dvh');
        assert.match(c, /overflow-y-auto/);
        assert.match(c, /overscroll-contain/);
        assert.match(c, /p-\[var\(--overlay-pad\)\]/);
        assert.match(c, /env\(safe-area-inset-(?:top|bottom)\)/, 'clears the notch / home bar');
      });
    }
  }
  test("a caller's p-0 (sidebar, drawers) still wins", () => {
    assert.ok(!cn(sheetVariants({ side: 'left' }), 'p-0').includes('overlay-pad'));
  });
});

describe('alert dialog stays bounded and uses the shared padding', () => {
  const src = read('src/components/ui/alert-dialog.tsx');
  test('max height uses dvh, scrolls inside, keeps a gutter, uses overlay padding', () => {
    assert.match(src, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(src, /overflow-y-auto/);
    assert.match(src, /max-w-\[min\(32rem,calc\(100vw-1\.5rem\)\)\]/);
    assert.match(src, /p-\[var\(--overlay-pad\)\]/);
  });
  test('action and cancel buttons keep the 44px coarse floor', () => {
    assert.equal((src.match(/\[@media\(pointer:coarse\)\]:min-h-11/g) ?? []).length >= 2, true);
  });
});

describe('no shared overlay uses a plain vh unit', () => {
  for (const f of ['dialog', 'sheet', 'alert-dialog']) {
    test(f, () => {
      const code = read(`src/components/ui/${f}.tsx`).replace(/\/\*[\s\S]*?\*\//g, '');
      assert.deepEqual(code.match(/\b\d+vh\b/g) ?? [], []);
    });
  }
});

// ------------------------------------------------------------------ Motion

describe('reduced motion', () => {
  test('Skeleton only pulses for people who have not asked for less motion', () => {
    const out = html(createElement(Skeleton, { className: 'h-4' }));
    assert.match(out, /motion-safe:animate-pulse/);
    assert.ok(!/(?<!motion-safe:)animate-pulse/.test(out), out);
  });

  test('no bare animate-pulse / ping / bounce anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      read(file).split('\n').forEach((line, i) => {
        if (/(?<!motion-safe:)\banimate-(?:pulse|ping|bounce)\b/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  test('every animate-spin in shared UI and the owned forms is motion-reduce aware', () => {
    for (const file of SHARED_FILES) {
      for (const line of read(file).split('\n')) {
        if (line.includes('animate-spin')) assert.ok(line.includes('motion-reduce:animate-none'), `${file}: ${line.trim()}`);
      }
    }
  });

  test('global safety net switches off animations and transitions for prefers-reduced-motion', () => {
    const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}\n/);
    assert.ok(m, 'missing reduced-motion block');
    assert.match(m[1], /animation-duration:\s*0\.01ms !important/);
    assert.match(m[1], /transition-duration:\s*0\.01ms !important/);
    assert.match(m[1], /animation-iteration-count:\s*1 !important/);
  });

  test('dialog, sheet and alert-dialog animations are zeroed for reduced motion', () => {
    for (const f of ['dialog', 'sheet', 'alert-dialog']) {
      assert.match(read(`src/components/ui/${f}.tsx`), /motion-reduce:(?:!)?duration-0/, f);
    }
  });
});

// ------------------------------------------------------------------ Sonner

describe('sonner toast controls', () => {
  const src = read('src/components/ui/sonner.tsx');
  const prop = (name: string) => {
    const m = src.match(new RegExp(`${name}:\\s*\\n?\\s*"([^"]+)"`));
    assert.ok(m, `missing classNames.${name}`);
    return m[1];
  };
  test('action and cancel are at least 44px on touch', () => {
    for (const n of ['actionButton', 'cancelButton']) {
      const c = prop(n);
      assert.match(c, /\[@media\(pointer:coarse\)\]:min-h-11/, n);
      assert.match(c, /\[@media\(pointer:coarse\)\]:min-w-11/, n);
      assert.match(c, /motion-reduce:transition-none/, n);
    }
  });
  test('close button reaches 44px on touch (28px visible + 8px halo on each side)', () => {
    const c = prop('closeButton');
    assert.match(c, /\[@media\(pointer:coarse\)\]:!h-7/);
    assert.match(c, /\[@media\(pointer:coarse\)\]:!w-7/);
    assert.match(c, /after:-inset-2/);
    assert.match(c, /after:absolute/);
    assert.match(c, /motion-reduce:transition-none/);
    assert.match(src, /closeButton\b/);
  });
  test('action button hover/press use solid tokens', () => {
    const c = prop('actionButton');
    assert.match(c, /hover:bg-primary-hover/);
    assert.match(c, /active:bg-primary-active/);
    assert.ok(!/bg-primary\/\d+/.test(c));
  });
});

// ------------------------------------------------------------------- Forms

/** Every <Label>/<label> must point at a control that exists in the same file. */
function checkLabels(file: string) {
  const src = read(file);
  const tags = [...src.matchAll(/<(Label|label)\b([^>]*)>/g)];
  for (const [, , attrs] of tags) {
    const m = attrs.match(/htmlFor=\{([^}]+(?:\}[^}]*`)?)\}/) ?? attrs.match(/htmlFor="([^"]+)"/);
    assert.ok(m, `${file}: <Label> without htmlFor -> ${attrs.trim().slice(0, 60)}`);
    const expr = m[1];
    const quoted = attrs.includes('htmlFor="');
    const needle = quoted ? `id="${expr}"` : `id={${expr}}`;
    assert.ok(src.includes(needle), `${file}: no control with ${needle}`);
  }
  return tags.length;
}

describe('NotificationScheduleForm', () => {
  const file = 'src/components/NotificationScheduleForm.tsx';
  const src = read(file);
  test('every label points at a real control', () => assert.ok(checkLabels(file) >= 5));
  test('every select trigger has an id and a 44px touch floor', () => {
    const triggers = [...src.matchAll(/<SelectTrigger\b([^>]*)>/g)];
    assert.equal(triggers.length, 4);
    for (const [, attrs] of triggers) {
      assert.match(attrs, /\bid=\{/);
      assert.match(attrs, /className=\{TRIGGER_CLASS\}/);
    }
    assert.match(src, /TRIGGER_CLASS = '\[@media\(pointer:coarse\)\]:min-h-11'/);
  });
  test('day checkboxes are a labelled group with 44px tap rows and ids scoped by useId', () => {
    assert.match(src, /role="group" aria-labelledby=\{daysLabelId\}/);
    assert.match(src, /\[@media\(pointer:coarse\)\]:min-h-11 \[@media\(pointer:coarse\)\]:min-w-11/);
    assert.ok(!/id=\{`day-/.test(src), 'ids must not be global');
    assert.match(src, /useId\(\)/);
  });
  test('saving is explained when no day is picked', () => {
    assert.match(src, /role="alert"/);
    assert.match(src, /disabled=\{saving \|\| selectedDays\.length === 0\}/);
  });
  test('cron text uses a >= 4.5:1 colour on the muted panel', () => {
    assert.ok(!/<code[^>]*text-primary/.test(src));
    for (const [n, t] of Object.entries(themes)) assert.ok(ratio(toRgb(t.foreground), toRgb(t.muted)) >= 4.5, n);
  });
});

describe('DailyNoteForm', () => {
  const file = 'src/components/DailyNoteForm.tsx';
  const src = read(file);
  test('every label points at a real control', () => assert.ok(checkLabels(file) >= 2));
  test('tags are keyboard-accessible ToggleChip buttons, not clickable badges', () => {
    assert.ok(!/<Badge\b/.test(src));
    assert.match(src, /<ToggleChip key=\{tag\} pressed=\{selectedTags\.includes\(tag\)\} onPressedChange=\{\(\) => toggleTag\(tag\)\}/);
    assert.match(src, /role="group" aria-labelledby=\{tagsLabelId\}/);
  });
  test('selected tags, severity and note values are still the same state', () => {
    assert.match(src, /setSelectedTags\(\(prev\) =>\s*prev\.includes\(tag\) \? prev\.filter\(\(t\) => t !== tag\) : \[\.\.\.prev, tag\]/);
    assert.match(src, /tags: selectedTags/);
    assert.match(src, /setSeverity\(severity === level \? null : level\)/);
  });
  test('toggle-style buttons announce their state', () => {
    assert.equal((src.match(/aria-pressed=\{/g) ?? []).length, 3);
  });
});

describe('no clickable <Badge> anywhere in src', () => {
  test('use ToggleChip / Button so the control is keyboard reachable', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      for (const m of read(file).matchAll(/<Badge\b[^>]*\bonClick\b/g)) offenders.push(`${file}: ${m[0].slice(0, 40)}`);
    }
    assert.deepEqual(offenders, []);
  });
});

describe('owned labels are associated', () => {
  test('relative path sanity', () => assert.equal(relative(root, join(root, 'tests')), 'tests'));
  for (const file of ['src/components/NotificationScheduleForm.tsx', 'src/components/DailyNoteForm.tsx']) {
    test(`${file}: no <Label> without htmlFor`, () => {
      const bare = [...read(file).matchAll(/<(?:Label|label)\b(?![^>]*htmlFor)[^>]*>/g)].map((m) => m[0]);
      assert.deepEqual(bare, []);
    });
  }
});
