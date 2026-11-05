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
import {
  getBottomNavItems,
  getQuickLogItems,
  isMoreActive,
  isNavItemActive,
  type NavItemConfig,
} from '@/app/navigation';
import { cn } from '@/lib/utils';
import { LiquidDock } from './LiquidDock';

/**
 * Every dock slot shares one layout: a 28px icon box with a 12px label under it. Colours come from the
 * scoped dock tokens (index.css), so the icons stay readable on the dark glass in both themes.
 * The active slot (data-active) hides its own icon because the bubble draws it, and gains a taller
 * tap area so the part of the bubble that rises above the glass is tappable too.
 */
const SLOT_CLASS = cn(
  'dock-slot group relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-xs font-medium transition-colors',
  'text-[hsl(var(--dock-ink-soft))] data-[active=true]:text-[hsl(var(--dock-ink))] [@media(hover:hover)]:hover:text-[hsl(var(--dock-ink))]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--dock-accent))]',
  'data-[active=true]:before:absolute data-[active=true]:before:inset-x-0 data-[active=true]:before:-top-6 data-[active=true]:before:h-6 data-[active=true]:before:content-[""]',
);
/**
 * Same slot look for the two real buttons (Log, More). They are the shared Button, so they keep
 * its focus ring, pressed feedback and aria-busy/disabled handling; these classes only undo the
 * Button's own size, padding, hover tint and 16px icon rule so all five slots stay identical.
 */
const SLOT_BUTTON_CLASS = cn(
  SLOT_CLASS,
  'h-full min-h-0 whitespace-normal py-0 [&_svg]:size-5 focus-visible:ring-offset-0',
  '[@media(hover:hover)]:hover:bg-transparent active:bg-transparent active:text-[hsl(var(--dock-ink))]',
);
const ICON_BOX_CLASS =
  'flex h-7 w-7 items-center justify-center transition-[opacity,transform] duration-200 group-active:scale-90 group-data-[active=true]:opacity-0 motion-reduce:transition-none';
const BUBBLE_ICON_CLASS = 'h-[1.375rem] w-[1.375rem]';

type IconComponent = NavItemConfig['icon'];

const DestinationLink = ({ item, active }: { item: NavItemConfig; active: boolean }) => (
  <NavLink to={item.to} data-active={active} className={SLOT_CLASS}>
    <span className={ICON_BOX_CLASS}>
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
        <Button type="button" variant="ghost" aria-haspopup="dialog" className={SLOT_BUTTON_CLASS}>
          {/* An action, not a destination: an outlined ring, never the filled bubble. */}
          <span className={cn(ICON_BOX_CLASS, 'dock-log-ring')}>
            <Plus className="!size-4" aria-hidden="true" />
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
 *
 * Visually it is a floating glass dock (LiquidDock): the bubble and the scoop in the glass sit on the
 * one active destination (Home, Meals, Gym or More) and slide together when it changes. Log is an
 * action, so it never gets the bubble. Exactly one slot is active; "More" covers every other page.
 */
export const BottomNav = ({ moreOpen, onOpenMore, moreRef }: BottomNavProps) => {
  const { pathname } = useLocation();
  const { before, after } = useMemo(getBottomNavItems, []);
  const moreActive = moreOpen || isMoreActive(pathname);

  // Slot order: before..., Log, after..., More.
  const logIndex = before.length;
  const moreIndex = before.length + 1 + after.length;
  let activeIndex = moreIndex;
  if (!moreActive) {
    const b = before.findIndex((item) => isNavItemActive(item, pathname));
    const a = after.findIndex((item) => isNavItemActive(item, pathname));
    if (b >= 0) activeIndex = b;
    else if (a >= 0) activeIndex = logIndex + 1 + a;
  }
  const icons: IconComponent[] = [...before.map((i) => i.icon), Plus, ...after.map((i) => i.icon), Menu];
  const ActiveIcon = icons[activeIndex];

  return (
    <nav
      aria-label="Quick access"
      data-bottom-nav
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+var(--dock-float))] left-[calc(env(safe-area-inset-left)+var(--dock-inset))] right-[calc(env(safe-area-inset-right)+var(--dock-inset))] z-40 h-[var(--dock-body)] sm:hidden"
    >
      <LiquidDock activeIndex={activeIndex} activeIcon={<ActiveIcon className={BUBBLE_ICON_CLASS} aria-hidden="true" />}>
        <ul className="flex h-full items-stretch px-2">
          {before.map((item, i) => (
            <li key={item.to} className="min-w-0 flex-1" data-dock-slot>
              <DestinationLink item={item} active={activeIndex === i} />
            </li>
          ))}
          <li className="min-w-0 flex-1" data-dock-slot>
            <QuickLog />
          </li>
          {after.map((item, i) => (
            <li key={item.to} className="min-w-0 flex-1" data-dock-slot>
              <DestinationLink item={item} active={activeIndex === logIndex + 1 + i} />
            </li>
          ))}
          <li className="min-w-0 flex-1" data-dock-slot>
            <Button
              ref={moreRef}
              type="button"
              variant="ghost"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={onOpenMore}
              data-active={activeIndex === moreIndex}
              className={SLOT_BUTTON_CLASS}
            >
              <span className={ICON_BOX_CLASS}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>More</span>
            </Button>
          </li>
        </ul>
      </LiquidDock>
    </nav>
  );
};
