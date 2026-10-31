import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Lock } from 'lucide-react';
import { ImportExportButton } from '@/components/ImportExportButton';
import { DemoBanner, DEMO_EMAIL } from '@/components/DemoBanner';
import { OfflineBadge } from '@/components/OfflineBadge';
import { useUser } from '@/contexts/UserContext';
import { APP_VERSION } from '@/lib/version';
import { ROUTES } from '@/app/navigation';
import { PAGE_GUTTER_CLASS } from './Page';
import { useInsideAppShell } from './shell-context';
import { NavDrawer } from './NavDrawer';
import { AccountMenu } from './AccountMenu';

/**
 * Jumps keyboard users past the header. Pages bring their own <main> today,
 * so the target is found at click time instead of being hard-wired.
 */
const SkipLink = () => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target =
      document.getElementById('main-content') ??
      document.querySelector<HTMLElement>('main') ??
      document.querySelector<HTMLElement>('[data-app-content]');
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    target.focus({ preventScroll: true });
    // Leave room for the sticky header so focus is not hidden under it.
    const headerHeight = document.querySelector<HTMLElement>('[data-app-header]')?.offsetHeight ?? 0;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - headerHeight });
  };

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:fixed focus:left-[max(1rem,env(safe-area-inset-left))] focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
};

/**
 * The one app header: skip link, sticky bar, and (for the demo account) a
 * banner that scrolls away with the page while a small badge stays in the bar.
 */
interface AppHeaderProps {
  /** Pass these to open the drawer from elsewhere (the bottom bar). Leave out outside the app shell. */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  onDrawerCloseAutoFocus?: (event: Event) => void;
}

export const AppHeader = ({ drawerOpen, onDrawerOpenChange, onDrawerCloseAutoFocus }: AppHeaderProps = {}) => {
  const { user } = useUser();
  // Inside the shell the phone bottom bar's "More" replaces the header menu button.
  const insideShell = useInsideAppShell();
  const isDemo = user?.email === DEMO_EMAIL;

  return (
    <>
      <SkipLink />
      <header
        data-app-header
        className="sticky top-0 z-50 w-full border-b bg-card/80 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] backdrop-blur-sm"
      >
        <div className={`container flex h-16 items-center justify-between gap-2 ${PAGE_GUTTER_CLASS}`}>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NavDrawer
              open={drawerOpen}
              onOpenChange={onDrawerOpenChange}
              onCloseAutoFocus={onDrawerCloseAutoFocus}
              hideTriggerOnPhones={insideShell}
            />
            <Link
              to={ROUTES.dashboard}
              aria-label="FitTrack dashboard"
              className="flex items-center justify-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Dumbbell className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
              </span>
              <span className="hidden text-xl font-bold sm:inline">
                FitTrack<span className="ml-1.5 text-sm">v{APP_VERSION}</span>
              </span>
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <OfflineBadge />
            {isDemo && (
              <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground sm:inline-flex">
                <Lock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Demo
              </span>
            )}
            <ImportExportButton />
            {/* AccountMenu owns its trigger; on touch screens make that trigger at least 44x44 from here. */}
            <div className="flex items-center [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11">
              <AccountMenu />
            </div>
          </div>
        </div>
      </header>
      {isDemo && <DemoBanner />}
    </>
  );
};
