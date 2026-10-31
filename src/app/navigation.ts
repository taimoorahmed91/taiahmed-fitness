import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Calendar,
  Dumbbell,
  FileText,
  Footprints,
  GraduationCap,
  History,
  IdCard,
  LayoutDashboard,
  MessageCircle,
  Moon,
  Ruler,
  ScrollText,
  Scale,
  Trophy,
  UserCheck,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for every signed-in route path and for the
 * navigation drawer. App.tsx reads paths from ROUTES; the drawer, page titles,
 * the phone bottom bar and the quick-log sheet all read from NAV_ITEMS /
 * NAV_GROUPS, so a route is added or renamed in exactly one place.
 */
export const ROUTES = {
  dashboard: '/dashboard',
  meals: '/meals',
  gym: '/gym',
  extraActivity: '/extra-activity',
  calorieHistory: '/calorie-history',
  weight: '/weight',
  waist: '/waist',
  sleep: '/sleep',
  dailyNotes: '/daily-notes',
  calendar: '/calendar',
  compare: '/compare',
  reports: '/reports',
  achievements: '/achievements',
  whoopData: '/whoop-data',
  logs: '/logs',
  howTo: '/how-to',
  messaging: '/messaging',
  personalData: '/personal-data',
  adminApproval: '/admin/approval',
} as const;

export type NavGroupId = 'overview' | 'log' | 'body' | 'review' | 'help' | 'admin';

export interface NavGroupConfig {
  id: NavGroupId;
  label: string;
  /** Hide the visible heading (the group is still labelled for screen readers). */
  hideLabel?: boolean;
}

export interface NavItemConfig {
  to: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
  /** Only shown to the account owner. */
  ownerOnly?: boolean;
  /**
   * Shown as a destination in the phone bottom bar. Keep this to 3: the bar
   * is Home, Meals, [Log], Gym, More, and the other two slots are fixed.
   */
  mobilePrimary?: boolean;
  /** Shorter label for tight spaces such as the bottom bar (defaults to `label`). */
  shortLabel?: string;
  /** Offered in the quick-log sheet, with a one-line hint about what you can do there. */
  quickLog?: string;
}

export const NAV_GROUPS: NavGroupConfig[] = [
  { id: 'overview', label: 'Overview', hideLabel: true },
  { id: 'log', label: 'Log today' },
  { id: 'body', label: 'Body & recovery' },
  { id: 'review', label: 'Review & insights' },
  { id: 'help', label: 'Help & records' },
  { id: 'admin', label: 'Admin' },
];

export const NAV_ITEMS: NavItemConfig[] = [
  { to: ROUTES.dashboard, label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, group: 'overview', mobilePrimary: true },

  { to: ROUTES.meals, label: 'Meals', icon: Utensils, group: 'log', mobilePrimary: true, quickLog: 'Add a meal' },
  { to: ROUTES.gym, label: 'Gym', icon: Dumbbell, group: 'log', mobilePrimary: true },
  { to: ROUTES.extraActivity, label: 'Extra Activity', icon: Footprints, group: 'log', quickLog: 'Walks, sports, chores' },
  { to: ROUTES.dailyNotes, label: 'Daily Notes', icon: FileText, group: 'log', quickLog: 'Symptoms and feelings' },

  { to: ROUTES.weight, label: 'Weight', icon: Scale, group: 'body', quickLog: 'Add a weigh-in' },
  { to: ROUTES.waist, label: 'Waist', icon: Ruler, group: 'body', quickLog: 'Add a measurement' },
  { to: ROUTES.sleep, label: 'Sleep', icon: Moon, group: 'body', quickLog: 'Add last night' },
  { to: ROUTES.whoopData, label: 'WHOOP Data', icon: Activity, group: 'body' },
  { to: ROUTES.personalData, label: 'Personal Data', icon: IdCard, group: 'body' },

  { to: ROUTES.calendar, label: 'Calendar', icon: Calendar, group: 'review' },
  { to: ROUTES.compare, label: 'Compare', icon: ArrowLeftRight, group: 'review' },
  { to: ROUTES.reports, label: 'Reports', icon: BarChart3, group: 'review' },
  { to: ROUTES.calorieHistory, label: 'Calorie History', icon: History, group: 'review' },
  { to: ROUTES.achievements, label: 'Achievements', icon: Trophy, group: 'review' },

  { to: ROUTES.messaging, label: 'Messaging', icon: MessageCircle, group: 'help' },
  { to: ROUTES.howTo, label: 'How-to', icon: GraduationCap, group: 'help' },
  { to: ROUTES.logs, label: 'Audit Log', icon: ScrollText, group: 'help' },

  { to: ROUTES.adminApproval, label: 'User Approval', icon: UserCheck, group: 'admin', ownerOnly: true },
];

export interface NavSection {
  group: NavGroupConfig;
  items: NavItemConfig[];
}

/** Groups with their visible items, in display order. Empty groups are dropped. */
export const getNavSections = (isOwner: boolean): NavSection[] =>
  NAV_GROUPS.map((group) => ({
    group,
    items: NAV_ITEMS.filter((item) => item.group === group.id && (isOwner || !item.ownerOnly)),
  })).filter((section) => section.items.length > 0);

/** Find the nav entry for a pathname (also matches nested paths). */
export const findNavItem = (pathname: string): NavItemConfig | undefined =>
  NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

/**
 * Whether a pathname belongs to a nav entry. Mirrors the router's NavLink
 * matching: the exact path or anything nested below it.
 */
export const isNavItemActive = (item: Pick<NavItemConfig, 'to'>, pathname: string): boolean =>
  pathname === item.to || pathname.startsWith(`${item.to}/`);

/**
 * Destinations in the phone bottom bar, left to right, around the central
 * Log button: Home, Meals, (Log), Gym. "More" opens the drawer and is not a route.
 */
export const getBottomNavItems = (): { before: NavItemConfig[]; after: NavItemConfig[] } => {
  const primary = NAV_ITEMS.filter((item) => item.mobilePrimary);
  const split = Math.ceil(primary.length / 2);
  return { before: primary.slice(0, split), after: primary.slice(split) };
};

/** Items offered by the quick-log sheet, in NAV_ITEMS order. Each is a plain link to a page. */
export const getQuickLogItems = (): (NavItemConfig & { quickLog: string })[] =>
  NAV_ITEMS.filter((item): item is NavItemConfig & { quickLog: string } => !!item.quickLog);

/** True when the current page is not one of the bottom-bar destinations, so "More" should look selected. */
export const isMoreActive = (pathname: string): boolean => {
  const item = findNavItem(pathname);
  return !!item && !item.mobilePrimary;
};
