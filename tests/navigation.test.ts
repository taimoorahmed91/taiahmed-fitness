import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  NAV_ITEMS,
  ROUTES,
  findNavItem,
  getBottomNavItems,
  getNavSections,
  getQuickLogItems,
  isMoreActive,
  isNavItemActive,
} from '../src/app/navigation';
import {
  BOTTOM_BAR_CLEARANCE,
  BOTTOM_BAR_HEIGHT_REM,
  BOTTOM_BAR_MEDIA_QUERY,
  BOTTOM_BAR_VAR,
  BOTTOM_BAR_VAR_CLASS,
} from '../src/components/layout/bottom-bar';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('navigation config', () => {
  test('route paths and nav items are unique', () => {
    const paths = NAV_ITEMS.map((i) => i.to);
    expect(new Set(paths).size).toBe(paths.length);
    for (const item of NAV_ITEMS) expect(Object.values(ROUTES)).toContain(item.to);
  });

  test('bottom bar is Home, Meals, (Log), Gym around the centre slot', () => {
    const { before, after } = getBottomNavItems();
    expect(before.map((i) => i.to)).toEqual([ROUTES.dashboard, ROUTES.meals]);
    expect(after.map((i) => i.to)).toEqual([ROUTES.gym]);
    expect(before[0].shortLabel).toBe('Home');
  });

  test('exactly three destinations are mobilePrimary, none owner-only', () => {
    const primary = NAV_ITEMS.filter((i) => i.mobilePrimary);
    expect(primary).toHaveLength(3);
    expect(primary.some((i) => i.ownerOnly)).toBe(false);
  });

  test('quick log offers meal, weight, sleep, waist, extra activity and notes, and nothing else', () => {
    const routes = getQuickLogItems().map((i) => i.to).sort();
    expect(routes).toEqual(
      [ROUTES.meals, ROUTES.weight, ROUTES.sleep, ROUTES.waist, ROUTES.extraActivity, ROUTES.dailyNotes].sort(),
    );
    for (const item of getQuickLogItems()) {
      expect(item.quickLog.length).toBeGreaterThan(0);
      expect(item.ownerOnly).toBeFalsy();
    }
  });

  test('every drawer destination is reachable: bottom bar, quick log or More', () => {
    const owner = getNavSections(true).flatMap((s) => s.items);
    expect(owner.length).toBe(NAV_ITEMS.length);
    expect(getNavSections(false).flatMap((s) => s.items).some((i) => i.ownerOnly)).toBe(false);
  });

  test('active matching covers nested paths but not look-alike prefixes', () => {
    const meals = NAV_ITEMS.find((i) => i.to === ROUTES.meals)!;
    expect(isNavItemActive(meals, '/meals')).toBe(true);
    expect(isNavItemActive(meals, '/meals/42')).toBe(true);
    expect(isNavItemActive(meals, '/meals-archive')).toBe(false);
  });

  test('More looks selected only on pages that are not bottom-bar destinations', () => {
    expect(isMoreActive(ROUTES.dashboard)).toBe(false);
    expect(isMoreActive(ROUTES.meals)).toBe(false);
    expect(isMoreActive(ROUTES.gym)).toBe(false);
    expect(isMoreActive(ROUTES.weight)).toBe(true);
    expect(isMoreActive(ROUTES.reports)).toBe(true);
    expect(isMoreActive('/nowhere')).toBe(false);
    expect(findNavItem('/nowhere')).toBeUndefined();
  });
});

describe('bottom bar sizing', () => {
  test('one height is shared by the variable, the CSS class and the bar row', () => {
    expect(BOTTOM_BAR_VAR).toBe('--bottom-bar-height');
    expect(BOTTOM_BAR_VAR_CLASS).toContain(`[${BOTTOM_BAR_VAR}:${BOTTOM_BAR_HEIGHT_REM}rem]`);
    expect(BOTTOM_BAR_VAR_CLASS).toContain(`sm:[${BOTTOM_BAR_VAR}:0px]`);
    // Tailwind h-16 = 4rem.
    expect(read('src/components/layout/BottomNav.tsx')).toContain(`h-${BOTTOM_BAR_HEIGHT_REM * 4}`);
  });

  test('bar is phone-only and matches the breakpoint where the CSS variable drops to 0', () => {
    expect(BOTTOM_BAR_MEDIA_QUERY).toBe('(max-width: 639.98px)');
    expect(read('src/components/layout/BottomNav.tsx')).toContain('sm:hidden');
  });

  test('clearance adds the home-indicator safe area to the bar height', () => {
    expect(BOTTOM_BAR_CLEARANCE).toBe('calc(var(--bottom-bar-height, 0px) + env(safe-area-inset-bottom))');
    expect(read('src/components/layout/BottomNav.tsx')).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  test('at 320px all five slots are at least 44px wide and tall, and the icon pill fits its slot', () => {
    const { before, after } = getBottomNavItems();
    const slots = before.length + 1 + after.length + 1; // + Log + More
    expect(slots).toBe(5);
    const slotWidth = 320 / slots;
    expect(slotWidth).toBeGreaterThanOrEqual(44);
    expect(BOTTOM_BAR_HEIGHT_REM * 16).toBeGreaterThanOrEqual(44);
    const pillRem = Number(/h-8 w-(\d+)/.exec(read('src/components/layout/BottomNav.tsx'))?.[1]);
    expect(pillRem * 4).toBeLessThanOrEqual(slotWidth);
  });

  test('bar text stays at 12px or larger', () => {
    const source = read('src/components/layout/BottomNav.tsx');
    expect(source).toContain('text-xs');
    expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/);
  });
});

describe('shell wiring', () => {
  test('only AppLayout renders the bottom bar, so public routes never get it', () => {
    expect(read('src/components/layout/AppLayout.tsx')).toContain('<BottomNav');
    for (const file of ['src/App.tsx', 'src/pages/Welcome.tsx', 'src/pages/PendingApproval.tsx', 'src/pages/OAuthConsent.tsx', 'src/pages/NotFound.tsx']) {
      expect(read(file)).not.toContain('BottomNav');
    }
  });

  test('bar landmark is named differently from the drawer landmark and marks the current page', () => {
    const bar = read('src/components/layout/BottomNav.tsx');
    const drawer = read('src/components/layout/NavDrawer.tsx');
    expect(bar.match(/<nav\b/g)).toHaveLength(1);
    expect(bar).toContain('aria-label="Quick access"');
    expect(drawer).toContain('aria-label="Primary"');
    // NavLink sets aria-current="page" on the active destination; the bar styles from that attribute.
    expect(bar).toContain("from '@/components/NavLink'");
    expect(bar).toContain('aria-[current=page]');
  });

  test('layout supplies the single main landmark and the bar clearance', () => {
    const layout = read('src/components/layout/AppLayout.tsx');
    expect(layout).toContain("role={needsMain ? 'main' : undefined}");
    expect(layout).toContain('BOTTOM_BAR_CLEARANCE');
    expect(layout).toContain('useBottomBarVariable');
  });

  test('chat button already offsets by the shared variable', () => {
    expect(read('src/components/ChatBot.tsx')).toContain('var(--bottom-bar-height, 0px)');
  });

  test('demo banner never reloads the page', () => {
    expect(read('src/components/DemoBanner.tsx')).not.toContain('location.reload');
  });

  test('no page imports the removed Navigation component', () => {
    for (const file of ['src/pages/Meals.tsx', 'src/pages/Gym.tsx', 'src/pages/Dashboard.tsx']) {
      expect(read(file)).not.toContain('components/Navigation');
    }
  });
});
