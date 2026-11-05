import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps one absolutely positioned indicator on the active drawer item.
 *
 * Items are found by `data-nav-to` and measured with offsetLeft / offsetTop / offsetWidth / offsetHeight
 * (relative to the positioned nav, so scrolling needs no re-measure). The indicator is moved with
 * transform only; the CSS transition in index.css (.nav-indicator[data-ready]) does the gliding and is
 * switched off for prefers-reduced-motion. The first placement happens with no transition, so opening
 * the drawer never animates; `data-ready` is switched on after that first paint.
 */
export const useNavIndicator = (
  navRef: RefObject<HTMLElement>,
  indicatorRef: RefObject<HTMLElement>,
  activeTo: string | null,
) => {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;

    const place = () => {
      const item = activeTo
        ? Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-to]')).find((el) => el.dataset.navTo === activeTo)
        : undefined;
      if (!item || item.offsetWidth === 0) {
        indicator.dataset.visible = 'false';
        return;
      }
      indicator.style.width = `${item.offsetWidth}px`;
      indicator.style.height = `${item.offsetHeight}px`;
      indicator.style.transform = `translate3d(${item.offsetLeft}px,${item.offsetTop}px,0)`;
      indicator.dataset.visible = 'true';
    };

    place();
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = 'true';
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(nav);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [navRef, indicatorRef, activeTo]);
};
