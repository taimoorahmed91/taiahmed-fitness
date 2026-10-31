import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleScrollTopReset } from '../src/components/DailyNoteForm';

const read = (f: string) => readFileSync(join(import.meta.dir, '..', f), 'utf8');

describe('Daily Notes tag-filter chip count contrast', () => {
  const src = read('src/pages/DailyNotes.tsx');
  const chip = src.slice(src.indexOf('stats.topTags.slice'), src.indexOf('</Button>', src.indexOf('stats.topTags.slice')));
  test('pressed count uses full primary-foreground, unpressed count stays muted', () => {
    assert.match(chip, /tag === t \? 'text-primary-foreground' : 'opacity-70'/);
  });
  test('no unconditional opacity on the count', () => {
    assert.doesNotMatch(chip, /className="[^"]*opacity-70/);
  });
  test('aria-pressed and the tag label are preserved', () => {
    assert.match(chip, /aria-pressed=\{tag === t\}/);
    assert.match(chip, /\{t\} <span/);
  });
});

describe('Daily Notes date popover scroll reset', () => {
  const src = read('src/components/DailyNoteForm.tsx');
  test('popover is controlled and its ref is reset on open / mode / month-count change', () => {
    assert.match(src, /<Popover open=\{dateOpen\} onOpenChange=\{setDateOpen\}>/);
    assert.match(src, /ref=\{popoverRef\}/);
    assert.match(src, /\[dateOpen, mode, wideCalendar\]/);
    assert.match(src, /scheduleScrollTopReset\(\(\) => popoverRef\.current\)/);
  });
  test('bounded scroll and one-month-below-sm behaviour is untouched', () => {
    assert.match(src, /overflow-auto/);
    assert.match(src, /numberOfMonths=\{wideCalendar \? 2 : 1\}/);
  });

  test('scrollTop is zeroed immediately and again after focus / resize settle', async () => {
    const el = { scrollTop: 240 };
    const cancel = scheduleScrollTopReset(() => el, [0, 20]);
    assert.equal(el.scrollTop, 0); // immediate
    el.scrollTop = 180; // simulates focus scrolling the selected day into view
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(el.scrollTop, 0);
    cancel();
  });
  test('cancel stops pending resets and a missing element is safe', async () => {
    const el = { scrollTop: 0 };
    const cancel = scheduleScrollTopReset(() => el, [10]);
    cancel();
    el.scrollTop = 50;
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(el.scrollTop, 50);
    const stop = scheduleScrollTopReset(() => null, [0]);
    stop();
  });
});
