import { useId, useRef, type ReactNode } from 'react';
import { DOCK_BODY_PX } from './liquidDockPath';
import { useLiquidDock } from './useLiquidDock';

interface LiquidDockProps {
  /** Which `[data-dock-slot]` the bubble sits on. */
  activeIndex: number;
  /** Icon drawn inside the bubble for the active slot. */
  activeIcon: ReactNode;
  /** The slots (a list whose items carry `data-dock-slot`). Rendered above the glass and bubble. */
  children: ReactNode;
}

/**
 * The look of the phone dock: a floating pill of dark glass with a scoop cut into its top edge,
 * and an orange bubble sitting in that scoop. Both move together to the active slot.
 * Everything here is decorative (aria-hidden); the real, focusable controls are the children.
 * Styling lives in index.css under `[data-bottom-nav]`; geometry in liquidDockPath.ts.
 */
export const LiquidDock = ({ activeIndex, activeIcon, children }: LiquidDockProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rimId = `dock-rim-${uid}`;
  const lightId = `dock-light-${uid}`;
  useLiquidDock(rootRef, activeIndex);
  // The glow swell and icon pop only play after the active tab has actually changed, never on first paint.
  const initialIndex = useRef(activeIndex);
  const hasChanged = useRef(false);
  if (activeIndex !== initialIndex.current) hasChanged.current = true;

  return (
    <div ref={rootRef} className="relative h-full w-full">
      {/* Soft shadow under the body, cut from the same outline. */}
      <svg aria-hidden="true" focusable="false" className="dock-shadow pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path data-dock-path />
      </svg>
      {/* Frosted glass. The clip-path is the outline, so the blur follows the scoop. */}
      <div data-dock-glass aria-hidden="true" className="dock-glass pointer-events-none absolute inset-0" />
      {/* Rim: a thin gradient stroke on the same outline, plus a little orange light near the scoop. */}
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={rimId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={DOCK_BODY_PX}>
            <stop offset="0" className="dock-rim-top" />
            <stop offset="0.45" className="dock-rim-mid" />
            <stop offset="1" className="dock-rim-bottom" />
          </linearGradient>
          <radialGradient id={lightId} data-dock-rim-light gradientUnits="userSpaceOnUse" cx="0" cy="8" fx="0" fy="8" r="58">
            <stop offset="0" className="dock-rim-light-core" />
            <stop offset="1" className="dock-rim-light-edge" />
          </radialGradient>
        </defs>
        <path data-dock-path fill="none" stroke={`url(#${rimId})`} strokeWidth="1" />
        <path data-dock-path fill="none" stroke={`url(#${lightId})`} strokeWidth="1.5" />
      </svg>
      {/* Bubble: slides by transform only. Its glow cross-fades in when the active tab changes. */}
      <div data-dock-bubble aria-hidden="true" className="dock-bubble-track pointer-events-none absolute left-0">
        <span key={`glow-${activeIndex}`} className={hasChanged.current ? 'dock-glow dock-animate' : 'dock-glow'} />
        <span className="dock-bubble">
          <span key={activeIndex} className={hasChanged.current ? 'dock-icon-pop dock-animate flex items-center justify-center' : 'flex items-center justify-center'}>
            {activeIcon}
          </span>
        </span>
      </div>
      <div className="relative z-[2] h-full w-full">{children}</div>
    </div>
  );
};
