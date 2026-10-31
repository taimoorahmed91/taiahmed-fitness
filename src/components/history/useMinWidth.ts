import { useCallback, useSyncExternalStore } from 'react';

/**
 * True when the viewport is at least `px` wide (and, with `finePointer`, the main pointer is a mouse or trackpad).
 * The history lists ask for a fine pointer before using their compact inline icons: on a touch tablet the same
 * width gets the roomy, 44px tray layout instead. Reads the real value on the first render (no flash of the wrong
 * layout) and follows resizes. Where matchMedia does not exist (tests, very old browsers) it answers false, which
 * is the phone layout.
 */
export const useMinWidth = (px: number, finePointer = false): boolean => {
  const query = finePointer ? `(min-width: ${px}px) and (pointer: fine)` : `(min-width: ${px}px)`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener?.(onChange);
      return () => list.removeListener?.(onChange);
    },
    [query],
  );
  const getSnapshot = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

/** Breakpoints used by the history lists (match Tailwind's md and lg). */
export const HISTORY_MD = 768;
export const HISTORY_LG = 1024;
