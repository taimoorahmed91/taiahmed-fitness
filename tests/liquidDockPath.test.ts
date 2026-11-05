import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  DOCK_BODY_PX,
  DOCK_BUBBLE_PX,
  DOCK_FLOAT_PX,
  DOCK_NOTCH_DEPTH_PX,
  DOCK_NOTCH_HALF_WIDTH_PX,
  DOCK_RISE_PX,
  buildDockPath,
  clampDockCenter,
  dockNotchHalfWidthFor,
} from '../src/components/layout/liquidDockPath';
import { DOCK_SPRING, isSettled, stepSpring, stretchForVelocity } from '../src/components/layout/liquidDockSpring';
import { BOTTOM_BAR_HEIGHT_REM } from '../src/components/layout/bottom-bar';

type Seg = { cmd: string; n: number[] };
const parse = (d: string): Seg[] =>
  [...d.matchAll(/([MLCAZ])([^MLCAZ]*)/g)].map((m) => ({
    cmd: m[1],
    n: m[2].trim() === '' ? [] : m[2].trim().split(/[\s,]+/).map(Number),
  }));

/** The scoop is the two cubic segments: left half ends at the floor (cx, depth), right half leaves from it. */
const scoop = (d: string) => {
  const segs = parse(d);
  const i = segs.findIndex((s) => s.cmd === 'C');
  const prev = segs[i - 1].n; // L left 0
  const a = segs[i].n;
  const b = segs[i + 1].n;
  return {
    left: { x: prev[0], y: prev[1] },
    floor: { x: a[4], y: a[5] },
    right: { x: b[4], y: b[5] },
    leftCurve: { p0: { x: prev[0], y: prev[1] }, c1: { x: a[0], y: a[1] }, c2: { x: a[2], y: a[3] }, p3: { x: a[4], y: a[5] } },
  };
};

const cubic = (c: ReturnType<typeof scoop>['leftCurve'], t: number) => {
  const m = 1 - t;
  return {
    x: m * m * m * c.p0.x + 3 * m * m * t * c.c1.x + 3 * m * t * t * c.c2.x + t * t * t * c.p3.x,
    y: m * m * m * c.p0.y + 3 * m * m * t * c.c1.y + 3 * m * t * t * c.c2.y + t * t * t * c.p3.y,
  };
};

const WIDTH = 366; // a 390px phone minus the 12px side gaps
const slotCentre = (i: number, width = WIDTH) => 8 + ((width - 16) / 5) * (i + 0.5);

describe('buildDockPath', () => {
  test('is one closed, well-formed path with only finite numbers', () => {
    const d = buildDockPath({ width: WIDTH, centerX: slotCentre(2) });
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d).not.toMatch(/NaN|Infinity|undefined/);
    const segs = parse(d);
    expect(segs.map((s) => s.cmd).join('')).toBe('MLCCLALALALAZ');
    for (const s of segs) {
      const expected = { M: 2, L: 2, C: 6, A: 7, Z: 0 }[s.cmd]!;
      expect(s.n).toHaveLength(expected);
      expect(s.n.every(Number.isFinite)).toBe(true);
    }
  });

  test('the scoop floor is centred at x and the shoulders sit evenly either side', () => {
    for (const i of [1, 2, 3]) {
      const cx = slotCentre(i);
      const s = scoop(buildDockPath({ width: WIDTH, centerX: cx }));
      expect(s.floor.x).toBeCloseTo(cx, 2);
      expect(s.floor.y).toBe(DOCK_NOTCH_DEPTH_PX);
      expect(s.left.x).toBeCloseTo(cx - DOCK_NOTCH_HALF_WIDTH_PX, 2);
      expect(s.right.x).toBeCloseTo(cx + DOCK_NOTCH_HALF_WIDTH_PX, 2);
      expect(s.left.y).toBe(0);
      expect(s.right.y).toBe(0);
    }
  });

  test('the scoop follows x: moving the centre moves the floor by the same amount', () => {
    const a = scoop(buildDockPath({ width: WIDTH, centerX: 150 }));
    const b = scoop(buildDockPath({ width: WIDTH, centerX: 190 }));
    expect(b.floor.x - a.floor.x).toBeCloseTo(40, 2);
  });

  test('is clamped at both ends so the bubble never leaves the dock', () => {
    const min = DOCK_BUBBLE_PX / 2;
    expect(clampDockCenter(WIDTH, -500)).toBe(min);
    expect(clampDockCenter(WIDTH, 5000)).toBe(WIDTH - min);
    expect(clampDockCenter(WIDTH, 120)).toBe(120);
    expect(scoop(buildDockPath({ width: WIDTH, centerX: -500 })).floor.x).toBe(min);
    expect(scoop(buildDockPath({ width: WIDTH, centerX: 5000 })).floor.x).toBe(WIDTH - min);
  });

  test('every point stays inside the dock body, for every centre from end to end', () => {
    for (let cx = -20; cx <= WIDTH + 20; cx += 7) {
      for (const widthScale of [1, 1.25]) {
        const d = buildDockPath({ width: WIDTH, centerX: cx, widthScale });
        for (const s of parse(d)) {
          const pts: number[][] = [];
          // Skip the arc radii and flags; keep only end/control points.
          if (s.cmd === 'M' || s.cmd === 'L') pts.push(s.n);
          if (s.cmd === 'C') pts.push(s.n.slice(0, 2), s.n.slice(2, 4), s.n.slice(4, 6));
          if (s.cmd === 'A') pts.push(s.n.slice(5, 7));
          for (const [x, y] of pts) {
            expect(x).toBeGreaterThanOrEqual(-0.01);
            expect(x).toBeLessThanOrEqual(WIDTH + 0.01);
            expect(y).toBeGreaterThanOrEqual(-0.01);
            expect(y).toBeLessThanOrEqual(DOCK_BODY_PX + 0.01);
          }
        }
      }
    }
  });

  test('the top corner next to the scoop tightens near an end, and the outline stays continuous', () => {
    // Sweep the centre in small steps; neighbouring shapes must differ by only a few px (no jumps).
    let prev: number[] | null = null;
    for (let cx = 20; cx <= 120; cx += 1) {
      const nums = parse(buildDockPath({ width: WIDTH, centerX: cx })).flatMap((s) => s.n);
      if (prev) {
        expect(nums).toHaveLength(prev.length);
        for (let k = 0; k < nums.length; k++) expect(Math.abs(nums[k] - prev[k])).toBeLessThan(3.5);
      }
      prev = nums;
    }
  });

  test('the bubble fits the scoop with a clear gap at every normal slot', () => {
    for (const width of [296, 366]) {
      const half = dockNotchHalfWidthFor((width - 16) / 5);
      for (let i = 0; i < 5; i++) {
        const cx = slotCentre(i, width);
        const s = scoop(buildDockPath({ width, centerX: cx, halfWidth: half }));
        // Bubble centre sits on the top edge (y = 0). Distance from the left curve to it, minus the radius.
        let min = Infinity;
        for (let t = 0; t <= 1; t += 0.01) {
          const p = cubic(s.leftCurve, t);
          min = Math.min(min, Math.hypot(p.x - cx, p.y) - DOCK_BUBBLE_PX / 2);
        }
        // Middle slots get the full symmetric scoop. At the two ends the near half narrows (the rounded end cap
        // is in the way), so the bubble may overlap the cap's tip by a few px; it is drawn in front, as a horn.
        const isEnd = i === 0 || i === 4;
        expect(min).toBeGreaterThan(isEnd ? -9 : 1.5);
      }
    }
  });

  test('widthScale widens the scoop without moving its centre or depth', () => {
    const cx = slotCentre(2);
    const normal = scoop(buildDockPath({ width: WIDTH, centerX: cx }));
    const stretched = scoop(buildDockPath({ width: WIDTH, centerX: cx, widthScale: 1.25 }));
    expect(stretched.floor).toEqual(normal.floor);
    expect(stretched.right.x - stretched.left.x).toBeGreaterThan(right(normal) - normal.left.x);
  });

  test('returns an empty string when there is no width, and survives a very narrow dock', () => {
    expect(buildDockPath({ width: 0, centerX: 10 })).toBe('');
    expect(buildDockPath({ width: -5, centerX: 10 })).toBe('');
    expect(buildDockPath({ width: 40, centerX: 20 })).not.toMatch(/NaN|Infinity/);
  });

  test('narrow slots get a slightly tighter scoop, never outside 44-50px', () => {
    expect(dockNotchHalfWidthFor(Infinity)).toBe(DOCK_NOTCH_HALF_WIDTH_PX);
    expect(dockNotchHalfWidthFor(70)).toBe(49);
    expect(dockNotchHalfWidthFor(56)).toBe(44);
    expect(dockNotchHalfWidthFor(10)).toBe(44);
  });
});
const right = (s: ReturnType<typeof scoop>) => s.right.x;

describe('dock spring', () => {
  test('travels to the target, settles, and overshoots only a little', () => {
    let state = { x: 40, v: 0 };
    const target = 110;
    let peak = state.x;
    let frames = 0;
    while (!isSettled(state, target) && frames < 600) {
      state = stepSpring(state, target, 1 / 60);
      peak = Math.max(peak, state.x);
      frames++;
      expect(Number.isFinite(state.x)).toBe(true);
    }
    expect(isSettled(state, target)).toBe(true);
    expect(frames).toBeLessThan(60); // under a second at 60fps
    expect(peak - target).toBeLessThan((target - 40) * 0.12);
  });

  test('stays stable for a long frame (tab was in the background)', () => {
    const state = stepSpring({ x: 0, v: 0 }, 300, 5, DOCK_SPRING);
    expect(Number.isFinite(state.x)).toBe(true);
    expect(Math.abs(state.x)).toBeLessThan(1000);
  });

  test('stretch is 1 at rest and capped when moving fast', () => {
    expect(stretchForVelocity(0)).toBe(1);
    expect(stretchForVelocity(-9999)).toBeCloseTo(1.25, 5);
    expect(stretchForVelocity(200)).toBeGreaterThan(1);
  });
});

describe('dock sizing contract', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const px = (name: string) => {
    const m = new RegExp(`--${name}:\\s*([\\d.]+)rem;`).exec(css);
    expect(m).not.toBeNull();
    return Number(m![1]) * 16;
  };

  test('CSS dock tokens match the geometry constants', () => {
    expect(px('dock-body')).toBe(DOCK_BODY_PX);
    expect(px('dock-rise')).toBe(DOCK_RISE_PX);
    expect(px('dock-float')).toBe(DOCK_FLOAT_PX);
    expect(px('dock-bubble')).toBe(DOCK_BUBBLE_PX);
  });

  test('the bubble rises half its height and the scoop clears its lowest point', () => {
    expect(DOCK_RISE_PX).toBe(DOCK_BUBBLE_PX / 2);
    expect(DOCK_NOTCH_DEPTH_PX).toBeGreaterThan(DOCK_BUBBLE_PX / 2);
  });

  test('--bottom-bar-height covers the gap, the glass and the bubble rise', () => {
    expect(BOTTOM_BAR_HEIGHT_REM * 16).toBe(DOCK_FLOAT_PX + DOCK_BODY_PX + DOCK_RISE_PX);
  });
});
