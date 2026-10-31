import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BOTTOM_BAR_CLEARANCE, BOTTOM_BAR_HEIGHT_REM, BOTTOM_BAR_VAR_CLASS } from '../src/components/layout/bottom-bar';
import {
  CHAT_FAB_AIR_REM,
  CHAT_FAB_CLEARANCE,
  CHAT_FAB_EDGE,
  CHAT_FAB_SIZE_REM,
} from '../src/components/layout/Page';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = read('src/components/layout/AppLayout.tsx');
const chat = read('src/components/ChatBot.tsx');
const howTo = read('src/pages/HowTo.tsx');

const REM = 16;
/** Evaluate the shared clearance for a viewport the way CSS would: bar var, home-indicator inset (px). */
const clearancePx = (barRem: number, safeBottomPx: number) =>
  barRem * REM + Math.max(1 * REM, safeBottomPx) + (CHAT_FAB_SIZE_REM + CHAT_FAB_AIR_REM) * REM;
/** Where the chat button's top edge sits above the bottom of the viewport (no toast lift). */
const fabTopPx = (barRem: number, safeBottomPx: number) =>
  Math.max(1 * REM, safeBottomPx) + barRem * REM + CHAT_FAB_SIZE_REM * REM;

describe('shared bottom clearance for the chat button', () => {
  test('the shell content wrapper reserves the chat button zone, not a per-page value', () => {
    expect(layout).toContain("from './Page'");
    expect(layout).toContain('CHAT_FAB_CLEARANCE');
    expect(layout).toContain('BOTTOM_BAR_CLEARANCE');
    expect(layout).toMatch(/paddingBottom: CONTENT_BOTTOM_CLEARANCE/);
    expect(layout).toContain('max(${BOTTOM_BAR_CLEARANCE}, ${CHAT_FAB_CLEARANCE})');
  });

  test('the clearance uses the shared bottom bar variable and the safe area', () => {
    expect(CHAT_FAB_CLEARANCE).toBe(
      'calc(var(--bottom-bar-height, 0px) + max(1rem, env(safe-area-inset-bottom)) + 4rem)',
    );
    expect(BOTTOM_BAR_CLEARANCE).toContain('--bottom-bar-height');
  });

  test('the layout and the chat button agree on edge offset and size', () => {
    // ChatBot's source must use the same edge expression and a 3.5rem (h-14/w-14) button.
    expect(chat).toContain(`calc(${CHAT_FAB_EDGE} + var(--bottom-bar-height, 0px) +`);
    expect(CHAT_FAB_SIZE_REM).toBe(3.5);
    expect(chat).toContain('h-14 w-14');
    // Toast lift stays in place and is not folded into the permanent reserve.
    expect(chat).toContain('liftRem');
    expect(CHAT_FAB_CLEARANCE).not.toContain('liftRem');
  });

  test('the focus-hide behaviour is untouched', () => {
    expect(chat).toContain('hideFab = fieldFocused && !isOpen');
    expect(chat).toContain('data-chat-assistant="fab"');
  });

  test('clearance by viewport always keeps the last control above the button, with air to spare', () => {
    // 320, 390 and 768 wide, no home indicator: phones have the 4rem bar, 768 is `sm` and up (bar 0).
    expect(BOTTOM_BAR_VAR_CLASS).toContain(`[--bottom-bar-height:${BOTTOM_BAR_HEIGHT_REM}rem]`);
    const cases = [
      { width: 320, barRem: BOTTOM_BAR_HEIGHT_REM, safe: 0, reserve: 144 },
      { width: 390, barRem: BOTTOM_BAR_HEIGHT_REM, safe: 0, reserve: 144 },
      { width: 390, barRem: BOTTOM_BAR_HEIGHT_REM, safe: 34, reserve: 162 }, // iPhone home indicator
      { width: 768, barRem: 0, safe: 0, reserve: 80 },
      { width: 1280, barRem: 0, safe: 0, reserve: 80 },
    ];
    for (const c of cases) {
      expect(clearancePx(c.barRem, c.safe)).toBe(c.reserve);
      // The reserve alone ends above the button by exactly the air gap; pages add their own padding on top.
      expect(clearancePx(c.barRem, c.safe) - fabTopPx(c.barRem, c.safe)).toBe(CHAT_FAB_AIR_REM * REM);
    }
  });
});

describe('HowTo video iframe', () => {
  const iframe = howTo
    .slice(howTo.indexOf('<iframe'), howTo.indexOf('/>', howTo.indexOf('<iframe')))
    .replace(/^\s*\/\/.*$/gm, ''); // JSX attribute comments are not attributes

  test('asks for fullscreen exactly once, through the allow attribute', () => {
    expect(iframe.match(/\ballow=/g)).toHaveLength(1);
    expect(iframe).toContain('allow="fullscreen"');
    expect(iframe).not.toMatch(/allowFullScreen/i);
  });

  test('no attribute is repeated on the iframe', () => {
    const names = [...iframe.matchAll(/^\s+([A-Za-z-]+)(?:=|\s*$)/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });
});
