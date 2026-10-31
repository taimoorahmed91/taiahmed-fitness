import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from '../src/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '../src/components/ui/select';
import { Checkbox } from '../src/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../src/components/ui/radio-group';

// Runtime corrective lane 1: Daily Notes date popover bounds, 44px coarse-pointer targets on shared
// form controls, PersonalData labelled targets, and the header logo / account trigger.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const COARSE = '[@media(pointer:coarse)]';
const classOf = (markup: string, tag: string) => {
  const m = markup.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`));
  assert.ok(m, `no <${tag} class> in ${markup}`);
  return m[1].split(/\s+/);
};

describe('shared inputs keep 40px for mouse and reach 44px on touch', () => {
  test('Input', () => {
    const c = classOf(renderToStaticMarkup(createElement(Input)), 'input');
    assert.ok(c.includes('h-10'));
    assert.ok(c.includes(`${COARSE}:min-h-11`));
  });
  test('SelectTrigger', () => {
    const c = classOf(
      renderToStaticMarkup(createElement(Select, null, createElement(SelectTrigger, null, createElement(SelectValue)))),
      'button',
    );
    assert.ok(c.includes('h-10'));
    assert.ok(c.includes(`${COARSE}:min-h-11`));
  });
});

describe('checkbox and radio: 16px glyph, 44px touch box, same layout footprint', () => {
  const boxes = {
    checkbox: classOf(renderToStaticMarkup(createElement(Checkbox)), 'button'),
    radio: classOf(
      renderToStaticMarkup(createElement(RadioGroup, null, createElement(RadioGroupItem, { value: 'a' }))),
      'button',
    ),
  };
  for (const [name, c] of Object.entries(boxes)) {
    test(`${name} stays 16px for mouse and keyboard`, () => {
      assert.ok(c.includes('h-4') && c.includes('w-4'));
    });
    test(`${name} is a 44x44 box on touch with a -14px margin so inline rows do not move`, () => {
      for (const token of ['h-11', 'w-11', 'min-h-11', 'min-w-11', 'm-[-14px]']) {
        assert.ok(c.includes(`${COARSE}:${token}`), `${name} missing ${token}`);
      }
      // 16px glyph + 2 x 14px margin box = 44px: the visible box is inset 14px (inset-3.5) inside it.
      assert.ok(c.includes(`${COARSE}:before:inset-3.5`));
      assert.ok(c.includes(`${COARSE}:border-transparent`));
    });
  }
});

describe('PersonalData: every checkbox / radio has a 44px labelled target', () => {
  const src = read('src/pages/PersonalData.tsx');
  test('gender radios: wrapper and label are at least 44px', () => {
    for (const id of ['g-m', 'g-f']) {
      assert.match(src, new RegExp(`<Label htmlFor="${id}" className="[^"]*min-h-11[^"]*min-w-11`));
    }
    assert.equal((src.match(/<div className="flex min-h-11 items-center gap-2">\s*<RadioGroupItem/g) ?? []).length, 2);
  });
  test('workout-day rows: wrapper and label are at least 44px', () => {
    const rows = read('src/components/personal-data/ScheduleEditor.tsx');
    assert.match(rows, /grid min-h-11 [^"]*items-center[^"]*"\s*>\s*<Checkbox/);
    assert.match(rows, /<Label htmlFor=\{`wd-\$\{d\.v\}`\} className="[^"]*min-h-11[^"]*min-w-11/);
  });
});

describe('Daily Notes date popover', () => {
  const src = read('src/components/DailyNoteForm.tsx');
  const content = src.slice(src.indexOf('<PopoverContent'), src.indexOf('</PopoverContent>'));
  test('is bounded to what Radix says is available and scrolls instead of clipping', () => {
    assert.match(content, /max-h-\[var\(--radix-popover-content-available-height\)\]/);
    assert.match(content, /max-w-\[min\(var\(--radix-popover-content-available-width\),calc\(100vw-1rem\)\)\]/);
    assert.match(content, /overflow-auto/);
    assert.match(content, /collisionPadding=\{8\}/);
  });
  test('shows one month below sm and two from sm, in range mode only', () => {
    assert.match(src, /\(min-width: 640px\)/);
    assert.match(src, /numberOfMonths=\{wideCalendar \? 2 : 1\}/);
    // single mode never asks for two months
    const single = content.slice(content.indexOf('mode="single"'), content.indexOf('mode="range"'));
    assert.doesNotMatch(single, /numberOfMonths/);
  });
  test('the single and range calendars are both inside the bounded popover', () => {
    assert.ok(content.includes('mode="single"') && content.includes('mode="range"'));
  });
});

describe('header touch targets', () => {
  const src = read('src/components/layout/AppHeader.tsx');
  test('logo link is at least 44x44 on touch', () => {
    const link = src.slice(src.indexOf('<Link'), src.indexOf('</Link>'));
    assert.ok(link.includes(`${COARSE}:min-h-11`) && link.includes(`${COARSE}:min-w-11`));
  });
  test('account trigger is at least 44x44 on touch', () => {
    const wrapper = src.slice(src.indexOf('<div className="flex items-center [@media'), src.indexOf('<AccountMenu />'));
    assert.ok(wrapper.includes(`${COARSE}:[&_button]:min-h-11`) && wrapper.includes(`${COARSE}:[&_button]:min-w-11`));
  });
});
