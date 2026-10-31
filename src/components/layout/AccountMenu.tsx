import { useMemo, useRef, useState } from 'react';
import { Laptop, LogOut, Moon, RefreshCw, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/contexts/UserContext';
import { requestAppRefresh } from '@/app/refresh';
import { useGlobalRefresh, useGlobalRefreshSnapshot } from '@/app/globalRefreshContext';
import { createAppRefresh, type DataRefreshOutcome } from '@/pwa/appRefresh';
import { getPwaController } from '@/pwa/pwaController';
import {
  REFRESH_ACTION_LABEL, REFRESH_BUSY_LABEL, REFRESH_LOADING_TOAST, REFRESH_UNEXPECTED_ERROR,
  describeAppRefresh, describeUpdateStarting,
} from '@/components/pwa/appRefreshCopy';
import { DEMO_EMAIL } from '@/components/DemoBanner';

/**
 * Secondary header actions (theme, refresh, sign out) in one menu so the
 * header never overflows on a phone. Import/export stays in the header.
 *
 * "Refresh app & data" is one action for both halves of "make sure I'm looking at the latest":
 *  - the data on screen, through the shell's single-flight owner (src/app/globalRefresh.ts), and
 *  - the app itself: it asks the service worker to check for a new version right now and, if one is
 *    waiting and no workout is in progress, installs it through the same gated applyUpdate() as the banner.
 * It never clears caches or unregisters the worker. Recovery for a browser stuck on an old worker stays `?sw=off`.
 */
export const AccountMenu = () => {
  const { user, logout } = useUser();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const isDemo = user?.email === DEMO_EMAIL;

  const globalRefresh = useGlobalRefresh();
  const { refreshing } = useGlobalRefreshSnapshot(globalRefresh);

  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const busy = running || refreshing;

  const appRefresh = useMemo(
    () =>
      createAppRefresh({
        controller: getPwaController(),
        // No full-page reload for data. The shell owns refreshing: it reloads every data source the current
        // page is showing, once, and tells us how it really went.
        refreshData: async (): Promise<DataRefreshOutcome> => {
          if (globalRefresh) return { kind: 'result', result: await globalRefresh.run() };
          // Outside the shell: fall back to the event contract and only claim what is known.
          return requestAppRefresh() ? { kind: 'requested' } : { kind: 'none' };
        },
      }),
    [globalRefresh],
  );

  const handleRefresh = async () => {
    if (runningRef.current) return; // repeat taps: the run in progress is the only one
    runningRef.current = true;
    setRunning(true);
    const toastId = toast.loading(REFRESH_LOADING_TOAST);
    try {
      let startingShown = false;
      const result = await appRefresh.run({
        // Applying may reload the page, so say so first.
        beforeApply: ({ data }) => {
          startingShown = true;
          const { message, description } = describeUpdateStarting(data);
          toast.info(message, { id: toastId, description, duration: 10_000 });
        },
      });
      if (!(startingShown && result.update === 'applied')) {
        const { kind, message, description } = describeAppRefresh(result);
        toast[kind](message, { id: toastId, description });
      }
    } catch {
      toast.error(REFRESH_UNEXPECTED_ERROR.message, { id: toastId, description: REFRESH_UNEXPECTED_ERROR.description });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2 sm:px-3" aria-label={`Account menu for ${displayName}`}>
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold uppercase text-primary-foreground"
          >
            {displayName.charAt(0)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold">{displayName}</span>
          {user?.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
          {isDemo && <span className="mt-1 block text-xs text-primary">Demo account - view only</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" className="min-h-10">
            <Sun className="mr-2 h-4 w-4" aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="min-h-10">
            <Moon className="mr-2 h-4 w-4" aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="min-h-10">
            <Laptop className="mr-2 h-4 w-4" aria-hidden="true" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10" disabled={busy} aria-busy={busy} onSelect={() => void handleRefresh()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          {busy ? REFRESH_BUSY_LABEL : REFRESH_ACTION_LABEL}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-10 text-destructive focus:text-destructive"
          onSelect={() => void handleLogout()}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
