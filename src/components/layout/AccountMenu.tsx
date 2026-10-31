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
import { describeManualRefresh } from '@/app/globalRefresh';
import { useGlobalRefresh, useGlobalRefreshSnapshot } from '@/app/globalRefreshContext';
import { DEMO_EMAIL } from '@/components/DemoBanner';

/**
 * Secondary header actions (theme, refresh, sign out) in one menu so the
 * header never overflows on a phone. Import/export stays in the header.
 */
export const AccountMenu = () => {
  const { user, logout } = useUser();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const isDemo = user?.email === DEMO_EMAIL;

  const globalRefresh = useGlobalRefresh();
  const { refreshing } = useGlobalRefreshSnapshot(globalRefresh);

  const handleRefresh = async () => {
    // No full-page reload. The shell owns refreshing (src/app/globalRefresh.ts): it reloads every
    // data source the current page is showing, once, and tells us how it really went.
    if (!globalRefresh) {
      // Outside the shell: fall back to the event contract and only claim what is known.
      if (!requestAppRefresh()) toast.info('Nothing to refresh on this page.');
      return;
    }
    const toastId = toast.loading('Refreshing your data…');
    try {
      const { kind, message, description } = describeManualRefresh(await globalRefresh.run());
      toast[kind](message, { id: toastId, description });
    } catch {
      toast.error("Couldn't refresh your data.", { id: toastId, description: 'Please try again.' });
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
        <DropdownMenuItem className="min-h-10" onSelect={() => void handleRefresh()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          {refreshing ? 'Refreshing…' : 'Refresh data'}
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
