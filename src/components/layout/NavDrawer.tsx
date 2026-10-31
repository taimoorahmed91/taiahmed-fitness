import { useMemo, useState } from 'react';
import { Dumbbell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useUser } from '@/contexts/UserContext';
import { APP_VERSION } from '@/lib/version';
import { getNavSections } from '@/app/navigation';
import { NavItem } from './NavItem';

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
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex w-72 max-w-[85vw] flex-col gap-0 p-0 pl-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="shrink-0 p-6 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Dumbbell className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </span>
            <span>
              FitTrack<span className="ml-1.5 text-sm">v{APP_VERSION}</span>
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">Move between FitTrack sections.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
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
                    className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {group.label}
                  </h3>
                )}
                <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavItem item={item} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
};
