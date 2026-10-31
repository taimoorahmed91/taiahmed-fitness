import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { findNavItem } from '@/app/navigation';
import { APP_REFRESH_EVENT } from '@/app/refresh';
import { createGlobalRefresh } from '@/app/globalRefresh';
import { GlobalRefreshContext } from '@/app/globalRefreshContext';
import { ShellContext } from './shell-context';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { PwaFeedback } from '@/components/pwa/PwaFeedback';
import { BOTTOM_BAR_CLEARANCE, BOTTOM_BAR_VAR_CLASS, useBottomBarVariable } from './bottom-bar';
import { CHAT_FAB_CLEARANCE } from './Page';

const APP_NAME = 'FitTrack';

/**
 * Bottom padding of the content wrapper: at least the bottom bar plus home indicator, and
 * (always larger in practice) enough to lift the last control above the floating chat button.
 */
const CONTENT_BOTTOM_CLEARANCE = `max(${BOTTOM_BAR_CLEARANCE}, ${CHAT_FAB_CLEARANCE})`;

/**
 * The signed-in application shell: one header, one main landmark, the phone
 * bottom bar, and safe-area padding. Use it as a layout route so the chrome
 * stays mounted while the user moves between pages:
 *
 *   <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
 *     <Route path="/meals" element={<Meals />} />
 *   </Route>
 *
 * Because it lives here, the bottom bar never appears on the welcome,
 * pending-approval, OAuth or 404 screens.
 *
 *  - Landmarks: this layout supplies role="main" on the content wrapper unless
 *    a page renders its own <main>/role="main", in which case the wrapper drops
 *    it, so there is never more than one. Pages should use PageContainer (a
 *    plain div) and leave the landmark to the layout.
 *  - Phones (< 640px): a fixed bottom bar (Home, Meals, Log, Gym, More). It
 *    publishes `--bottom-bar-height` (4rem, or 0 from `sm` up) on <html>; the
 *    content wrapper and the chat button add it plus the home-indicator safe
 *    area to their bottom spacing. The wrapper also reserves room for the chat
 *    button itself (CHAT_FAB_CLEARANCE in Page.tsx), so the last control on any
 *    page ends above it. Pages need no extra bottom padding.
 *  - "More" opens the same grouped drawer as the header. The header's own menu
 *    button is hidden on phones to avoid two ways in; from `sm` up the header
 *    drawer behaves as before.
 *  - PwaFeedback (under the header) shows "update ready" as a banner and "works offline" as a toast. An update
 *    never installs by itself and waits, without a button, while a workout is saved on the device.
 *  - Legacy `min-h-screen` on a direct child page root is flattened.
 *  - Data refreshing is owned here (src/app/globalRefresh.ts), not by any page: the header's
 *    "Refresh data" and the demo regeneration refresh every active shared query from any page, through
 *    one single-flight batch. Pages that have their own (non shared-table) refetches join it through
 *    useAutoRefresh or useRegisterRefreshTask.
 */
export const AppLayout = ({ children }: { children?: ReactNode }) => {
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsMain, setNeedsMain] = useState(true);

  useBottomBarVariable();

  // The shell-level refresh owner. One per shell, shared by everything inside it.
  const queryClient = useQueryClient();
  const globalRefresh = useMemo(() => createGlobalRefresh(() => queryClient), [queryClient]);
  // Answer the app-wide refresh request (src/app/refresh.ts) for any sender, on every protected page.
  useEffect(() => {
    const onRefresh = (event: Event) => {
      event.preventDefault();
      void globalRefresh.run();
    };
    window.addEventListener(APP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(APP_REFRESH_EVENT, onRefresh);
  }, [globalRefresh]);

  // The drawer is shared by the header button and the bottom bar's "More".
  const [drawerOpen, setDrawerOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const openedFromBar = useRef(false);
  const openFromBar = useCallback(() => {
    openedFromBar.current = true;
    setDrawerOpen(true);
  }, []);
  const handleDrawerOpenChange = useCallback((open: boolean) => {
    if (open) openedFromBar.current = false;
    setDrawerOpen(open);
  }, []);
  // Send focus back to whichever control opened the drawer.
  const handleDrawerCloseAutoFocus = useCallback((event: Event) => {
    if (!openedFromBar.current) return;
    event.preventDefault();
    moreRef.current?.focus();
  }, []);

  // Exactly one main landmark: only add ours when no page supplies one.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      setNeedsMain(!el.querySelector('main, [role="main"]'));
    };
    check();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(check);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // A distinct title per page helps screen reader users and browser history.
  useEffect(() => {
    const item = findNavItem(pathname);
    if (!item) return;
    const previous = document.title;
    document.title = `${item.label} | ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [pathname]);

  return (
    <ShellContext.Provider value>
      <GlobalRefreshContext.Provider value={globalRefresh}>
        <div className={`min-h-dvh bg-background ${BOTTOM_BAR_VAR_CLASS}`}>
          <AppHeader
            drawerOpen={drawerOpen}
            onDrawerOpenChange={handleDrawerOpenChange}
            onDrawerCloseAutoFocus={handleDrawerCloseAutoFocus}
          />
          {/* Update / offline-ready notices (src/pwa). Never reloads by itself; waits while a workout is saved. */}
          <PwaFeedback />
          <div
            ref={contentRef}
            data-app-content
            id={needsMain ? 'main-content' : undefined}
            role={needsMain ? 'main' : undefined}
            style={{ paddingBottom: CONTENT_BOTTOM_CLEARANCE }}
            className="min-w-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] [&>.min-h-screen]:min-h-0"
          >
            {children ?? <Outlet />}
          </div>
          <BottomNav moreOpen={drawerOpen} onOpenMore={openFromBar} moreRef={moreRef} />
        </div>
      </GlobalRefreshContext.Provider>
    </ShellContext.Provider>
  );
};
