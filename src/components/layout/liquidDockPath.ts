/**
 * Pure geometry for the phone bottom dock (no React, no DOM, so it can be unit tested).
 *
 * The dock body is a pill. Its top edge has a smooth scoop cut into it that wraps the
 * round "bubble" sitting on the active tab. `buildDockPath` returns that outline as one
 * SVG path string. The same string is used for the glass clip, the rim stroke and the shadow,
 * so every layer always has the same shape.
 *
 * Coordinates are in px, with (0, 0) at the top-left of the dock body and y growing downward.
 * The body's top edge is y = 0; the scoop goes down from there.
 */

/** Height of the glass body. */
export const DOCK_BODY_PX = 60;
/** Bubble diameter. Its centre sits on the body's top edge, so it rises half its height above it. */
export const DOCK_BUBBLE_PX = 48;
/** How far the bubble stands above the body. */
export const DOCK_RISE_PX = DOCK_BUBBLE_PX / 2;
/** Gap between the bottom of the screen (above the phone's safe area) and the dock. */
export const DOCK_FLOAT_PX = 8;
/** How far the scoop dips below the body's top edge. The bubble's lowest point is DOCK_RISE_PX below it. */
export const DOCK_NOTCH_DEPTH_PX = 30;
/** Scoop half-width at the top edge for a normal-sized slot. */
export const DOCK_NOTCH_HALF_WIDTH_PX = 50;

const NOTCH_HALF_WIDTH_MIN_PX = 44;
/** Smallest top-corner radius. The corner nearest the scoop tightens to this when the scoop reaches the end. */
const TOP_CORNER_MIN_PX = 14;
/** Share of the scoop half-width used for the two cubic handles (shoulder side, floor side). */
const SHOULDER_HANDLE = 0.4;
const FLOOR_HANDLE = 0.4;

export interface DockPathOptions {
  /** Dock body width. */
  width: number;
  /** Dock body height. Bottom corners are fully round (height / 2). */
  height?: number;
  /** Where the scoop is centred. Clamped so it never leaves the dock. */
  centerX: number;
  /** Scoop depth below the top edge. */
  depth?: number;
  /** Scoop half-width at the top edge, before `widthScale`. */
  halfWidth?: number;
  /** Stretches the scoop sideways, e.g. while the bubble is travelling (1 = normal). */
  widthScale?: number;
}

/** Scoop half-width that suits a given slot width (narrow phones get a slightly tighter scoop). */
export const dockNotchHalfWidthFor = (slotWidth: number): number =>
  Math.min(DOCK_NOTCH_HALF_WIDTH_PX, Math.max(NOTCH_HALF_WIDTH_MIN_PX, slotWidth * 0.7));

/** Keeps the scoop centre far enough from the ends that the bubble stays fully on the dock. */
export const clampDockCenter = (width: number, centerX: number): number => {
  const margin = DOCK_BUBBLE_PX / 2;
  if (width <= margin * 2) return width / 2;
  return Math.min(width - margin, Math.max(margin, centerX));
};

const r2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * One closed path: a pill with a smooth scoop in its top edge centred at `centerX`.
 * Returns '' for a width that cannot hold a dock.
 *
 * Near an end the scoop would collide with the rounded top corner. The corner on that side
 * tightens (down to TOP_CORNER_MIN_PX) and then the scoop's near half narrows, so the outline
 * stays one continuous, smooth curve as the scoop slides toward the edge.
 */
export const buildDockPath = ({
  width,
  height = DOCK_BODY_PX,
  centerX,
  depth = DOCK_NOTCH_DEPTH_PX,
  halfWidth = DOCK_NOTCH_HALF_WIDTH_PX,
  widthScale = 1,
}: DockPathOptions): string => {
  if (!(width > 0) || !(height > 0)) return '';
  const R = height / 2;
  const cx = clampDockCenter(width, centerX);
  const half = halfWidth * widthScale;
  const dip = Math.min(depth, height - 2);

  // Top corner radius: full pill unless the scoop would run into it.
  const rl = Math.min(R, Math.max(TOP_CORNER_MIN_PX, cx - half));
  const rr = Math.min(R, Math.max(TOP_CORNER_MIN_PX, width - cx - half));
  const lw = Math.min(half, cx - rl);
  const rw = Math.min(half, width - rr - cx);

  const left = cx - lw;
  const right = cx + rw;
  const d = [
    `M${r2(rl)} 0`,
    `L${r2(left)} 0`,
    `C${r2(left + lw * SHOULDER_HANDLE)} 0 ${r2(cx - lw * FLOOR_HANDLE)} ${r2(dip)} ${r2(cx)} ${r2(dip)}`,
    `C${r2(cx + rw * FLOOR_HANDLE)} ${r2(dip)} ${r2(right - rw * SHOULDER_HANDLE)} 0 ${r2(right)} 0`,
    `L${r2(width - rr)} 0`,
    `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(width)} ${r2(rr)}`,
    `L${r2(width)} ${r2(height - R)}`,
    `A${r2(R)} ${r2(R)} 0 0 1 ${r2(width - R)} ${r2(height)}`,
    `L${r2(R)} ${r2(height)}`,
    `A${r2(R)} ${r2(R)} 0 0 1 0 ${r2(height - R)}`,
    `L0 ${r2(rl)}`,
    `A${r2(rl)} ${r2(rl)} 0 0 1 ${r2(rl)} 0`,
    'Z',
  ];
  return d.join('');
};
