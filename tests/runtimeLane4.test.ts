import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

import tailwindConfig from '../tailwind.config';
import { buttonVariants } from '../src/components/ui/button';

// Runtime lane 4: (1) the chat button gets out of the way of focused form fields, (2) a pressed Button beats
// its hover colour when a mouse is used, (3) date fields never get squeezed into two narrow columns at 320px.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

// ------------------------------------------------------------ pressed beats hover (rendered CSS)

/** Compile the real Tailwind config against the real Button class strings. */
async function compileButtonCss() {
  const variants = ['default', 'destructive', 'secondary', 'outline', 'ghost'] as const;
  const content = variants.map((variant) => buttonVariants({ variant })).join(' ');
  const result = await postcss([
    tailwindcss({ ...(tailwindConfig as object), content: [{ raw: content }] } as never),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
}

interface Decl { selector: string; media: string; order: number; value: string }

/** Every `background-color` declaration for classes containing `needle`, in stylesheet order. */
function backgroundRules(css: string, needle: string): Decl[] {
  const out: Decl[] = [];
  let order = 0;
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (!rule.selector.includes(needle)) return;
    rule.walkDecls('background-color', (decl) => {
      const parent = rule.parent;
      const media = parent && parent.type === 'atrule' ? (parent as postcss.AtRule).params : '';
      out.push({ selector: rule.selector, media, order: order++, value: decl.value });
    });
  });
  return out;
}

/** Count class + pseudo-class parts: enough to rank the simple utility selectors Tailwind emits. */
const specificity = (selector: string) => (selector.match(/\.(?:\\.|[\w-])+|:(?!:)[\w-]+/g) ?? []).length;

/** Winner of the cascade for an element that is hovered AND pressed, on a device with a real mouse. */
function winner(css: string, token: string) {
  const applicable = backgroundRules(css, token).filter((d) => {
    const media = d.media.replace(/\s/g, '');
    const mediaOk = media === '' || media === '(hover:hover)';
    const states = d.selector.match(/:(hover|active)/g) ?? [];
    const stateOk = states.every((s) => s === ':hover' || s === ':active');
    return mediaOk && stateOk;
  });
  return applicable.sort((a, b) => specificity(a.selector) - specificity(b.selector) || a.order - b.order).at(-1)!;
}

describe('Button: pressed colour wins over hover (mouse, combined hover+active)', async () => {
  const css = await compileButtonCss();

  for (const [variant, role] of [['default', 'primary'], ['destructive', 'destructive'], ['secondary', 'secondary']] as const) {
    test(`${variant}: hovered + pressed paints ${role}-active, not ${role}-hover`, () => {
      // Only the background rules that can apply to this variant's own classes.
      const classes = buttonVariants({ variant }).split(/\s+/).filter((c) => c.includes(`bg-${role}`));
      assert.ok(classes.length >= 3, `expected base/hover/active classes for ${variant}: ${classes.join(' ')}`);
      const rules = [`bg-${role}-hover`, `bg-${role}-active`].flatMap((needle) => backgroundRules(css, needle));
      const applicable = rules.filter((d) => {
        const media = d.media.replace(/\s/g, '');
        return media === '' || media === '(hover:hover)';
      });
      const best = applicable.sort((a, b) => specificity(a.selector) - specificity(b.selector) || a.order - b.order).at(-1)!;
      assert.match(best.selector, new RegExp(`bg-${role}-active`), `winner was ${best.selector}`);
      assert.ok(best.selector.includes(':active'));
      // And a hover-only element still gets the hover colour (no regression).
      const hoverOnly = rules.filter((d) => !d.selector.includes(':active'));
      assert.ok(hoverOnly.some((d) => d.selector.includes(`bg-${role}-hover`) && d.selector.includes(':hover')));
    });

    test(`${variant}: touch keeps a plain active rule outside any hover media query`, () => {
      const plain = backgroundRules(css, `bg-${role}-active`).filter((d) => d.media === '' && !d.selector.includes(':hover'));
      assert.ok(plain.length >= 1, 'touch screens (no hover) still need the plain active: colour');
    });
  }

  test('outline and ghost use the same accent for hover and pressed, so order cannot change the colour', () => {
    for (const variant of ['outline', 'ghost'] as const) {
      const classes = buttonVariants({ variant });
      assert.match(classes, /hover:bg-accent/);
      assert.match(classes, /(?:^|\s)active:bg-accent/);
    }
  });

  test('winner helper sanity: it would catch the old hover-wins order', () => {
    const fakeCss = `.active\\:bg-primary-active:active{background-color:red}\n@media (hover:hover){.hover\\:bg-primary-hover:hover{background-color:blue}}`;
    const old = winner(fakeCss, 'bg-primary');
    assert.match(old.selector, /primary-hover/);
  });
});

// ------------------------------------------------------------ chat button vs focused fields

const chat = read('src/components/ChatBot.tsx');

describe('ChatBot: hides while a form field has focus', () => {
  test('listens to focusin and focusout on the document and cleans up', () => {
    assert.match(chat, /addEventListener\('focusin'/);
    assert.match(chat, /addEventListener\('focusout'/);
    assert.match(chat, /removeEventListener\('focusin'/);
    assert.match(chat, /removeEventListener\('focusout'/);
  });

  test('focus is re-read after the event settles so field-to-field moves do not flicker', () => {
    assert.match(chat, /setTimeout\(sync, 0\)/);
    assert.match(chat, /document\.activeElement/);
    assert.match(chat, /clearTimeout\(timer\)/);
  });

  test('its own button and panel are ignored, and an open chat keeps its close button', () => {
    assert.match(chat, /CHAT_OWN_SELECTOR = '\[data-chat-assistant\]'/);
    assert.match(chat, /data-chat-assistant="fab"/);
    assert.match(chat, /data-chat-assistant="panel"/);
    assert.match(chat, /hideFab = fieldFocused && !isOpen/);
  });

  test('hidden state is invisible, not clickable, not focusable, and animates back', () => {
    assert.match(chat, /pointer-events-none invisible/);
    assert.match(chat, /tabIndex=\{hideFab \? -1 : undefined\}/);
    assert.match(chat, /aria-hidden=\{hideFab \|\| undefined\}/);
    assert.match(chat, /transition-\[bottom,background-color,transform,opacity,visibility\]/);
  });

  test('still clears the bottom nav, the phone home bar and toasts', () => {
    assert.match(chat, /env\(safe-area-inset-bottom\)\) \+ var\(--bottom-bar-height, 0px\)/);
    assert.match(chat, /liftRem/);
  });

  test('the hook runs before the logged-out early return (rules of hooks)', () => {
    assert.ok(chat.indexOf("addEventListener('focusin'") < chat.indexOf('if (!isLoggedIn) return null'));
  });
});

type El = { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null };
// Pull the real helper out of the source so the test exercises the shipped logic without loading Supabase.
const helperSrc = chat.slice(chat.indexOf('const NON_TEXT_INPUT_TYPES'), chat.indexOf('/** The chat\'s own button'));
const isFormEntryElement = new Function(
  `${helperSrc.replace(/interface FocusTargetLike \{[\s\S]*?\}\n/, '').replace('// eslint-disable-next-line react-refresh/only-export-components\n', '').replace('export function isFormEntryElement(el: FocusTargetLike | null | undefined): boolean', 'function isFormEntryElement(el)').replace('const NON_TEXT_INPUT_TYPES = new Set([', 'const NON_TEXT_INPUT_TYPES = new Set([')}\nreturn isFormEntryElement;`,
)() as (el: El | null) => boolean;

describe('ChatBot: which focused elements count as form entry', () => {
  const el = (tagName: string, extra: Partial<El> = {}): El => ({ tagName, getAttribute: () => null, ...extra });
  test('text-like inputs, date/time pickers, select and textarea hide the button', () => {
    for (const type of ['text', 'date', 'time', 'number', 'email', 'password', 'search', 'datetime-local', 'month']) {
      assert.equal(isFormEntryElement(el('INPUT', { type })), true, type);
    }
    assert.equal(isFormEntryElement(el('SELECT')), true);
    assert.equal(isFormEntryElement(el('TEXTAREA')), true);
    assert.equal(isFormEntryElement(el('DIV', { isContentEditable: true })), true);
  });
  test('a Radix select (combobox/listbox/option roles) counts', () => {
    for (const role of ['combobox', 'listbox', 'option', 'textbox']) {
      assert.equal(isFormEntryElement(el('BUTTON', { getAttribute: (n) => (n === 'role' ? role : null) })), true, role);
    }
  });
  test('buttons, checkboxes, radios, sliders and plain elements do not', () => {
    for (const type of ['button', 'submit', 'checkbox', 'radio', 'range', 'file']) {
      assert.equal(isFormEntryElement(el('INPUT', { type })), false, type);
    }
    assert.equal(isFormEntryElement(el('BUTTON')), false);
    assert.equal(isFormEntryElement(el('A')), false);
    assert.equal(isFormEntryElement(null), false);
  });
});

// ------------------------------------------------------------ date fields at 320px

describe('date inputs are never squeezed into two columns below sm', () => {
  for (const page of ['Meals', 'Weight', 'Waist', 'Sleep']) {
    test(`${page}: every grid that holds a date field is one column until sm and its cells can shrink`, () => {
      const lines = read(`src/pages/${page}.tsx`).split('\n');
      let checked = 0;
      lines.forEach((line, i) => {
        if (!/className="grid [^"]*grid-cols-/.test(line)) return;
        // The grid owns a date field if one appears before its closing, i.e. within the next few fields.
        const next = lines.slice(i, i + 32).join('\n');
        const firstDate = next.indexOf('type="date"');
        if (firstDate < 0) return;
        const nextGrid = next.slice(next.indexOf('\n')).search(/className="grid /);
        if (nextGrid >= 0 && nextGrid + next.indexOf('\n') < firstDate) return;
        checked += 1;
        assert.match(line, /grid-cols-1/, `${page}:${i + 1} must start as one column`);
        assert.match(line, /sm:grid-cols-2/, `${page}:${i + 1} goes to two columns from sm`);
        assert.match(line, /\[&>\*\]:min-w-0/, `${page}:${i + 1} cells must be able to shrink`);
        assert.doesNotMatch(line, /(?:^|\s)grid-cols-2(?:\s|")/);
      });
      assert.ok(checked >= 1, `${page} should have at least one date grid`);
    });
  }
  test('Weight, Waist and Sleep have both the add form and the edit dialog covered', () => {
    for (const page of ['Weight', 'Waist', 'Sleep']) {
      assert.equal((read(`src/pages/${page}.tsx`).match(/sm:grid-cols-2 \[&>\*\]:min-w-0/g) ?? []).length, 2, page);
    }
  });
});

describe('MealForm: the add-meal time/date row is one column below sm', () => {
  const lines = read('src/components/MealForm.tsx').split('\n');
  const timeIdx = lines.findIndex((l) => l.includes('id="time"'));
  const gridLine = lines.slice(0, timeIdx).reverse().find((l) => /className="grid /.test(l)) ?? '';
  test('grid wrapping the Time and Date fields', () => {
    assert.ok(timeIdx > 0);
    assert.match(gridLine, /grid-cols-1/);
    assert.match(gridLine, /sm:grid-cols-2/);
    assert.match(gridLine, /\[&>\*\]:min-w-0/);
    assert.doesNotMatch(gridLine, /(?:^|\s)grid-cols-2(?:\s|")/);
  });
  test('fields, order, labels and descriptions are unchanged', () => {
    const src = lines.join('\n');
    const time = src.indexOf('id="time"');
    const date = src.indexOf('id="date"');
    assert.ok(time > 0 && date > time);
    assert.match(src, /label="Time Eaten"/);
    assert.match(src, /label="Date"/);
    assert.equal((src.match(/describedBy="meal-datetime-note"/g) ?? []).length, 2);
    assert.ok(src.indexOf('<MealDateTimeNote id="meal-datetime-note"') > date);
  });
});
