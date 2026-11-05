/**
 * A tiny critically-ish damped spring for the dock's moving bubble (no animation library needed).
 * Pure so the maths can be tested; the rAF loop lives in useLiquidDock.
 */

export interface SpringState {
  x: number;
  v: number;
}

/** Slightly under-damped (zeta ~0.7): quick, with a small overshoot that reads as liquid. */
export const DOCK_SPRING = { stiffness: 240, damping: 22 } as const;

const SUBSTEP = 1 / 240;

/** Advances the spring by `dt` seconds toward `target`, in fixed sub-steps so large frames stay stable. */
export const stepSpring = (
  state: SpringState,
  target: number,
  dt: number,
  { stiffness, damping }: { stiffness: number; damping: number } = DOCK_SPRING,
): SpringState => {
  let { x, v } = state;
  let left = Math.min(Math.max(dt, 0), 1 / 15);
  while (left > 0) {
    const h = Math.min(SUBSTEP, left);
    // Semi-implicit Euler: update velocity first, then position with the new velocity.
    v += (-stiffness * (x - target) - damping * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
};

/** True once the bubble is close enough and slow enough to snap onto its slot and stop the loop. */
export const isSettled = (state: SpringState, target: number): boolean =>
  Math.abs(state.x - target) < 0.05 && Math.abs(state.v) < 0.5;

/** How much to widen the scoop for a given speed (px/s): 1 at rest, up to 1.25 at full tilt. */
export const stretchForVelocity = (v: number): number => 1 + 0.25 * Math.min(1, Math.abs(v) / 450);
