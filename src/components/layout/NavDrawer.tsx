import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Dumbbell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useUser } from '@/contexts/UserContext';
import { APP_VERSION } from '@/lib/version';
import { getNavSections, isNavItemActive, type NavSection } from '@/app/navigation';
import { cn } from '@/lib/utils';
import { NavItem } from './NavItem';
import { useNavIndicator } from './useNavIndicator';

/** How long the drawer waits after a tap so the lit pill can be seen gliding to the new item. */
const CLOSE_AFTER_GLIDE_MS = 150;

/**
 * The grouped links plus the one lit indicator behind them. Lives inside the sheet so it mounts (and
 * measures) when the drawer opens. Tapping another item sends the indicator there at once, navigates,
 * and closes the drawer a moment later; tapping the current page closes straight away.
 */
const DrawerNav = ({ sections, onClose }: { sections: NavSection[]; onClose: () => void }) => {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number>();
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const currentTo = useMemo(
    () => sections.flatMap((s) => s.items).find((item) => isNavItemActive(item, pathname))?.to ?? null,
    [sections, pathname],
  );
  useNavIndicator(navRef, indicatorRef, pendingTo ?? currentTo);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Once the route has really changed, the router's own match takes over from the optimistic target.
  useEffect(() => setPendingTo(null), [pathname]);

  const handleNavigate = ({ to }: { to: string }) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (to === currentTo || reduce) {
      onClose();
      return;
    }
    setPendingTo(to);
    closeTimer.current = window.setTimeout(onClose, CLOSE_AFTER_GLIDE_MS);
  };

  return (
    <nav aria-label="Primary" ref={navRef} className="relative flex-1 overflow-y-auto px-3 pb-6 pt-2">
      <span ref={indicatorRef} aria-hidden="true" className="nav-indicator glow-selection" />
      {sections.map(({ group, items }) => {
        const headingId = `nav-group-${group.id}`;
        return (
          <div key={group.id} className="mt-5 first:mt-0">
            {group.hideLabel ? (
              <span id={headingId} className="sr-only">
                {group.label}
              </span>
            ) : (
              <h3
                id={headingId}
                className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--glass-ink-muted))]"
              >
                {group.label}
              </h3>
            )}
            <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavItem item={item} onNavigate={handleNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
};


interface NavDrawerProps {
  /** Control the drawer from outside (the phone bottom bar's "More"). Leave out to let it manage itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called when the drawer closes and focus is about to return; call preventDefault() to move focus elsewhere. */
  onCloseAutoFocus?: (event: Event) => void;
  /** Hide the header's menu button on phones, where the bottom bar's "More" opens this same drawer. */
  hideTriggerOnPhones?: boolean;
}

/** Left drawer with navigation grouped by what the user is trying to do. */
export const NavDrawer = ({ open: openProp, onOpenChange, onCloseAutoFocus, hideTriggerOnPhones = false }: NavDrawerProps) => {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const { isOwner } = useUser();
  const sections = useMemo(() => getNavSections(isOwner), [isOwner]);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className={hideTriggerOnPhones ? 'max-sm:hidden' : undefined}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        layout="dvh"
        hideClose
        onCloseAutoFocus={onCloseAutoFocus}
        overlayClassName="glass-scrim"
        className={cn(
          // Glass look comes from index.css (.glass-panel); the sheet's solid fill, edge border and shadow are replaced.
          'glass-panel glass-edge-end glass-drawer border-r-0 bg-transparent',
          'flex w-72 max-w-[85vw] flex-col gap-0 p-0 pl-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)]',
          // Softer travel for this drawer only (timing is in index.css under .glass-drawer); the Sheet defaults are untouched.
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        )}
      >
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--glass-border)/0.08)] p-6 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <SheetTitle className="flex items-center gap-2 text-[hsl(var(--glass-ink))]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--glow-accent))] shadow-[0_0_16px_-4px_hsl(var(--glow-accent)/0.6)]">
              <Dumbbell className="h-5 w-5 text-[hsl(var(--glow-accent-foreground))]" aria-hidden="true" />
            </span>
            <span>
              FitTrack<span className="ml-1.5 text-sm text-[hsl(var(--glass-ink-muted))]">v{APP_VERSION}</span>
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">Move between FitTrack sections.</SheetDescription>
        </SheetHeader>
        <DrawerNav sections={sections} onClose={close} />
        <SheetClose asChild>
          <CloseButton
            label="Close"
            className="absolute right-2 top-2 text-[hsl(var(--glass-ink-soft))] ring-offset-transparent focus-visible:ring-[hsl(var(--glow-accent))] focus-visible:ring-offset-0 [@media(hover:hover)]:hover:bg-[hsl(var(--glow-accent)/0.1)] [@media(hover:hover)]:hover:text-[hsl(var(--glass-ink))] active:bg-[hsl(var(--glow-accent)/0.1)] active:text-[hsl(var(--glass-ink))]"
          />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
};
