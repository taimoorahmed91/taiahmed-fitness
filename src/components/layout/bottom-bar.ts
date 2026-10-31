import { useLayoutEffect } from 'react';

/**
 * Shared sizing for the phone bottom navigation.
 *
 * `--bottom-bar-height` is the bar's own height (without the phone's home-bar
 * safe area) and is 0 wherever the bar is hidden. Anything fixed to the bottom
 * of the screen (the chat button) or scrolling under the bar (page content)
 * adds the safe area itself:
 *
 *   bottom: calc(env(safe-area-inset-bottom) + var(--bottom-bar-height, 0px))
 */
export const BOTTOM_BAR_VAR = '--bottom-bar-height';

/** Bar height in rem. Matches `h-16` on the bar's row. */
export const BOTTOM_BAR_HEIGHT_REM = 4;

/** The bar shows below Tailwind's `sm` breakpoint (640px); the header drawer takes over from there. */
export const BOTTOM_BAR_MEDIA_QUERY = '(max-width: 639.98px)';

/** Padding that keeps the last bit of page content clear of the bar and the home indicator. */
export const BOTTOM_BAR_CLEARANCE = `calc(var(${BOTTOM_BAR_VAR}, 0px) + env(safe-area-inset-bottom))`;

/**
 * Declares the variable for the layout subtree with plain CSS, so the first
 * paint is already correct. Written out in full so Tailwind can see the classes.
 */
export const BOTTOM_BAR_VAR_CLASS = '[--bottom-bar-height:4rem] sm:[--bottom-bar-height:0px]';

/**
 * Publishes `--bottom-bar-height` on <html> so elements outside the layout
 * (ChatBot is rendered next to the router) can clear the bar too. Also keeps
 * keyboard focus from being scrolled underneath the sticky header or the bar.
 */
export const useBottomBarVariable = () => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia(BOTTOM_BAR_MEDIA_QUERY);
    const apply = () => {
      root.style.setProperty(BOTTOM_BAR_VAR, query.matches ? `${BOTTOM_BAR_HEIGHT_REM}rem` : '0px');
    };
    apply();
    root.style.scrollPaddingBottom = `calc(${BOTTOM_BAR_CLEARANCE} + 1rem)`;
    root.style.scrollPaddingTop = 'calc(4rem + env(safe-area-inset-top) + 1rem)';
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
      root.style.removeProperty(BOTTOM_BAR_VAR);
      root.style.removeProperty('scroll-padding-bottom');
      root.style.removeProperty('scroll-padding-top');
    };
  }, []);
};
