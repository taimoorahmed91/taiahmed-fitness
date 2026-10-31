import { NavLink } from '@/components/NavLink';
import type { NavItemConfig } from '@/app/navigation';

interface NavItemProps {
  item: NavItemConfig;
  onNavigate?: () => void;
}

/** One drawer link. The router marks the active link with aria-current="page". */
export const NavItem = ({ item, onNavigate }: NavItemProps) => (
  <NavLink
    to={item.to}
    onClick={onNavigate}
    className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
  >
    <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
    <span className="truncate">{item.label}</span>
  </NavLink>
);
