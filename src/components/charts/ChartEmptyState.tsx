import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/app/navigation';
import { cn } from '@/lib/utils';

/** A real next step for an empty chart: a link to the page where the missing data is added. */
export interface ChartEmptyAction {
  /** What the link does, in plain words: "Log a meal", "Add a weigh-in". Never just "Click here". */
  label: string;
  /** In-app path, for example ROUTES.meals. */
  to: string;
}

interface ChartEmptyStateProps {
  children: ReactNode;
  className?: string;
  /**
   * Optional. Pass it only when there is a page that fixes the emptiness (no data logged yet).
   * Leave it out when the fix is something on the chart itself (a wider date range): the
   * message already says so, and a button that goes nowhere useful would be noise.
   * It renders as a link, so it keeps link behaviour (open in new tab, back button).
   */
  action?: ChartEmptyAction;
  /** A second link for charts fed by two pages (weight AND waist). Ignored without `action`. */
  secondaryAction?: ChartEmptyAction;
}

/** The one empty state for charts: quiet, centred, says what is missing and why. */
export const ChartEmptyState = ({ children, className, action, secondaryAction }: ChartEmptyStateProps) => (
  <div
    role="status"
    className={cn(
      'flex min-h-[10rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground',
      className,
    )}
  >
    <p>{children}</p>
    {action && (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {[action, secondaryAction].filter((a): a is ChartEmptyAction => !!a).map((a) => (
          <Button key={a.to} asChild variant="outline" size="touch">
            <Link to={a.to}>{a.label}</Link>
          </Button>
        ))}
      </div>
    )}
  </div>
);

/**
 * What a chart says when the person has logged NOTHING at all for it (not just nothing in the
 * chosen range). Only these cases get a link: a wider date range cannot fix them, logging can.
 * When data exists but sits outside the range, charts keep their own "Try a wider date range"
 * message and no action.
 */
export interface ChartNoDataEmpty {
  message: string;
  action: ChartEmptyAction;
  secondaryAction?: ChartEmptyAction;
}

const LOG_MEAL: ChartEmptyAction = { label: 'Log a meal', to: ROUTES.meals };

export const NO_DATA = {
  meals: { message: 'No meals logged yet.', action: LOG_MEAL },
  /** Meal-time chart reads at most 90 days. */
  meals90: { message: 'No meals logged in the last 90 days.', action: LOG_MEAL },
  weight: { message: 'No weight entries logged yet.', action: { label: 'Add a weigh-in', to: ROUTES.weight } },
  waist: { message: 'No waist measurements logged yet.', action: { label: 'Add a measurement', to: ROUTES.waist } },
  body: {
    message: 'No weight or waist entries logged yet.',
    action: { label: 'Add a weigh-in', to: ROUTES.weight },
    secondaryAction: { label: 'Add a measurement', to: ROUTES.waist },
  },
  sleep: { message: 'No sleep logged yet.', action: { label: 'Log last night', to: ROUTES.sleep } },
  workouts: { message: 'No workouts logged yet.', action: { label: 'Open Gym', to: ROUTES.gym } },
  whoop: { message: 'No WHOOP recovery scores yet.', action: { label: 'Open WHOOP data', to: ROUTES.whoopData } },
} satisfies Record<string, ChartNoDataEmpty>;

/**
 * Trend charts are identified by their storage id. Only ids with a clear owner page are listed:
 * "calorie_balance" needs meals AND WHOOP together, so no single link would be honest.
 */
export const TREND_NO_DATA: Record<string, ChartNoDataEmpty> = {
  weight: NO_DATA.weight,
  waist: NO_DATA.waist,
  sleep: NO_DATA.sleep,
  workout_duration: NO_DATA.workouts,
  recovery: NO_DATA.whoop,
};
