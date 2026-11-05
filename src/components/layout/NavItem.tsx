import { NavLink } from '@/components/NavLink';
import type { NavItemConfig } from '@/app/navigation';

interface NavItemProps {
  item: NavItemConfig;
  onNavigate?: (item: NavItemConfig) => void;
}

/**
 * One drawer link. The router marks the active link with aria-current="page".
 * The lit "selected" pill is not drawn here: one shared indicator in the drawer glides to the active
 * item (see useNavIndicator), so this link only changes its text and icon colour. `data-nav-to` is how
 * the indicator finds the item to measure.
 */
export const NavItem = ({ item, onNavigate }: NavItemProps) => (
  <NavLink
    to={item.to}
    data-nav-to={item.to}
    onClick={() => onNavigate?.(item)}
    className="group relative z-[1] flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[hsl(var(--glass-ink-soft))] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--glow-accent))] aria-[current=page]:text-[hsl(var(--glass-ink))] motion-reduce:transition-none [@media(hover:hover)]:hover:bg-[hsl(var(--glow-accent)/0.06)] [@media(hover:hover)]:hover:text-[hsl(var(--glass-ink))] [@media(hover:hover)]:aria-[current=page]:hover:bg-transparent"
  >
    <item.icon
      className="h-5 w-5 shrink-0 transition-[color,transform] duration-200 group-aria-[current=page]:text-[hsl(var(--glow-accent))] motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:text-[hsl(var(--glow-accent)/0.85)] [@media(hover:hover)]:group-aria-[current=page]:group-hover:translate-x-0 [@media(hover:hover)]:group-aria-[current=page]:group-hover:text-[hsl(var(--glow-accent))]"
      aria-hidden="true"
    />
    <span className="truncate">{item.label}</span>
  </NavLink>
);
