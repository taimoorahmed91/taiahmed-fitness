import { useEffect, useState } from 'react';

/**
 * Current time in ms, refreshed on an interval, plus an instant refresh when the tab
 * becomes visible or focused again (browsers slow timers down in background tabs).
 *
 * Use it ONLY inside a small leaf component (a clock face). The state lives here, so
 * each tick re-renders just that component, never the screen around it.
 */
export const useWallClock = (active = true, intervalMs = 1000): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', tick);
    };
  }, [active, intervalMs]);

  return now;
};
