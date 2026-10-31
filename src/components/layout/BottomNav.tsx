import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { getBottomNavItems, getQuickLogItems, isMoreActive, type NavItemConfig } from '@/app/navigation';
import { cn } from '@/lib/utils';

/** Every bar slot shares one layout: a 32px "pill" holding the icon, and a 12px label under it. */
const SLOT_CLASS =
  'group flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [@media(hover:hover)]:hover:text-foreground';
/**
 * Same slot look for the two real buttons (Log, More). They are the shared Button, so they keep
 * its focus ring, pressed feedback and aria-busy/disabled handling; these classes only undo the
 * Button's own size, padding, hover tint and 16px icon rule so all five slots stay identical.
 */
const SLOT_BUTTON_CLASS = cn(
  SLOT_CLASS,
  'h-full min-h-0 whitespace-normal py-0 [&_svg]:size-5 focus-visible:ring-offset-0',
  '[@media(hover:hover)]:hover:bg-transparent [@media(hover:hover)]:hover:text-foreground active:bg-transparent active:text-foreground',
);
const PILL_CLASS = 'flex h-8 w-14 items-center justify-center rounded-full transition-colors motion-reduce:transition-none';
const PILL_ACTIVE_CLASS = 'bg-primary/15 text-primary';

const DestinationLink = ({ item }: { item: NavItemConfig }) => (
  <NavLink to={item.to} className={cn(SLOT_CLASS, 'aria-[current=page]:text-foreground')}>
    <span className={cn(PILL_CLASS, 'group-aria-[current=page]:bg-primary/15 group-aria-[current=page]:text-primary')}>
      <item.icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
  </NavLink>
);

/** Opens a sheet of plain links to the pages where each kind of entry is added. It never saves anything itself. */
const QuickLog = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const items = useMemo(getQuickLogItems, []);

  // Close if the route changes by any other means (back button, link elsewhere).
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" aria-haspopup="dialog" className={cn(SLOT_BUTTON_CLASS, 'text-foreground')}>
          <span className={cn(PILL_CLASS, 'bg-primary text-primary-foreground shadow-sm')}>
            <Plus className="!size-6" aria-hidden="true" />
          </span>
          <span>Log</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" layout="mobile-full" closeLabel="Close quick log" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Quick log</SheetTitle>
          <SheetDescription>Pick what to log. You will go to that page, where you can add it.</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex min-h-[4.5rem] flex-col items-start gap-1 rounded-xl border bg-card p-3 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent [@media(hover:hover)]:hover:bg-accent"
              >
                <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.quickLog}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

interface BottomNavProps {
  /** Whether the grouped drawer is open (drives aria-expanded on "More"). */
  moreOpen: boolean;
  onOpenMore: () => void;
  /** Lets the layout return focus here when the drawer closes. */
  moreRef: RefObject<HTMLButtonElement>;
}

/**
 * Phone-only bottom navigation: Home, Meals, (Log), Gym, More.
 * Destinations come from NAV_ITEMS (`mobilePrimary`); "More" opens the same
 * grouped drawer as the header. Hidden from `sm` up, where the header drawer is used.
 */
export const BottomNav = ({ moreOpen, onOpenMore, moreRef }: BottomNavProps) => {
  const { pathname } = useLocation();
  const { before, after } = useMemo(getBottomNavItems, []);
  const moreActive = moreOpen || isMoreActive(pathname);

  return (
    <nav
      aria-label="Quick access"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-sm sm:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {before.map((item) => (
          <li key={item.to} className="min-w-0 flex-1">
            <DestinationLink item={item} />
          </li>
        ))}
        <li className="min-w-0 flex-1">
          <QuickLog />
        </li>
        {after.map((item) => (
          <li key={item.to} className="min-w-0 flex-1">
            <DestinationLink item={item} />
          </li>
        ))}
        <li className="min-w-0 flex-1">
          <Button
            ref={moreRef}
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={onOpenMore}
            className={cn(SLOT_BUTTON_CLASS, moreActive && 'text-foreground')}
          >
            <span className={cn(PILL_CLASS, moreActive && PILL_ACTIVE_CLASS)}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>More</span>
          </Button>
        </li>
      </ul>
    </nav>
  );
};
