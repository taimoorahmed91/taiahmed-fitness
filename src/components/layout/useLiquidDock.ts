import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  DOCK_BUBBLE_PX,
  buildDockPath,
  clampDockCenter,
  dockNotchHalfWidthFor,
} from './liquidDockPath';
import { isSettled, stepSpring, stretchForVelocity, type SpringState } from './liquidDockSpring';

/**
 * Drives the dock's moving parts without re-rendering React on every frame.
 *
 * One spring owns the scoop's x position. Each frame it writes, directly to the DOM:
 *   - the new outline path onto the glass clip-path and the rim / shadow SVG paths,
 *   - a transform on the bubble (so the bubble and the scoop can never drift apart),
 *   - the position of the rim light.
 * Only the path string changes per frame; the bubble uses transform alone.
 *
 * Slot centres are measured from the `[data-dock-slot]` elements and re-measured with a
 * ResizeObserver. First paint, resizes and prefers-reduced-motion all snap instead of animating.
 */
export const useLiquidDock = (rootRef: RefObject<HTMLElement>, activeIndex: number) => {
  const activeRef = useRef(activeIndex);
  const retargetRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const glass = root.querySelector<HTMLElement>('[data-dock-glass]');
    const bubble = root.querySelector<HTMLElement>('[data-dock-bubble]');
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('[data-dock-path]'));
    const light = root.querySelector<SVGRadialGradientElement>('[data-dock-rim-light]');
    const reduceMotion =
      typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    let width = 0;
    let halfWidth = dockNotchHalfWidthFor(Infinity);
    let centres: number[] = [];
    let spring: SpringState = { x: 0, v: 0 };
    let target = 0;
    let ready = false;
    let raf = 0;
    let last = 0;

    const draw = () => {
      if (width <= 0) return;
      const d = buildDockPath({ width, centerX: spring.x, halfWidth, widthScale: stretchForVelocity(spring.v) });
      const cx = clampDockCenter(width, spring.x);
      if (glass) {
        const clip = `path('${d}')`;
        glass.style.clipPath = clip;
        glass.style.setProperty('-webkit-clip-path', clip);
      }
      for (const p of paths) p.setAttribute('d', d);
      if (bubble) bubble.style.transform = `translate3d(${cx - DOCK_BUBBLE_PX / 2}px,0,0)`;
      if (light) {
        light.setAttribute('cx', String(cx));
        light.setAttribute('fx', String(cx));
      }
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const snap = () => {
      stop();
      spring = { x: target, v: 0 };
      draw();
    };

    const tick = (now: number) => {
      raf = 0;
      spring = stepSpring(spring, target, (now - last) / 1000);
      last = now;
      if (isSettled(spring, target)) {
        snap();
        return;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const retarget = () => {
      if (!ready) return;
      target = centres[activeRef.current] ?? width / 2;
      if (reduceMotion?.matches) {
        snap();
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      if (rootRect.width <= 0) {
        // Hidden (the bar is phone-only). Start from a clean slate when it is shown again.
        ready = false;
        stop();
        return;
      }
      const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-slot]'));
      centres = slots.map((s) => {
        const r = s.getBoundingClientRect();
        return r.left - rootRect.left + r.width / 2;
      });
      const resized = rootRect.width !== width;
      const first = !ready;
      width = rootRect.width;
      halfWidth = dockNotchHalfWidthFor(slots[0] ? slots[0].getBoundingClientRect().width : Infinity);
      ready = true;
      target = centres[activeRef.current] ?? width / 2;
      if (first || resized || reduceMotion?.matches) snap();
      else if (!isSettled(spring, target)) retarget();
    };

    retargetRef.current = retarget;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      retargetRef.current = null;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      stop();
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    activeRef.current = activeIndex;
    retargetRef.current?.();
  }, [activeIndex]);
};
