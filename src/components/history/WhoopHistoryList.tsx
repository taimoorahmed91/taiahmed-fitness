import { useMemo, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { WhoopEntry } from '@/hooks/useWhoopData';
import { HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow } from '@/components/history/HistoryRow';
import { ActionTray, HistoryAction, HistoryDeleteAction, HistoryInlineActions } from '@/components/history/ActionTray';
import { HistoryPager } from '@/components/history/HistoryPager';
import { useGroupPagination } from '@/components/history/useGroupPagination';
import { HISTORY_MD, useMinWidth } from '@/components/history/useMinWidth';
import { DayStamp } from '@/components/history/DayStamp';
import { BandChip } from '@/components/history/BandChip';
import { defaultToday, formatDay, formatWeekRange, isoWeekString, weekTitle } from '@/lib/historyDates';
import { fmt, groupByWeek, recoveryTone, sortNewestFirst } from '@/lib/bodyHistory';
import { caloriesFromKilojoule, summarizeWhoopWeek, whoopCore, whoopMetricGroups, type MetricCell } from '@/lib/whoopHistory';
import { cn } from '@/lib/utils';

/**
 * WHOOP history as a progressive summary, week by week (Monday to Sunday), newest first.
 *
 *  - Collapsed: the date and five core readings (Recovery with its High / Medium / Low WORD, HRV, resting HR on wide
 *    screens, Sleep performance, Strain). Nothing else competes with them.
 *  - Opened: every stored reading, grouped Recovery and body / Sleep / Activity, with units. Nothing is hidden or dropped.
 *  - Phone: the whole summary is one disclosure button, with a labelled Edit / Delete tray in the opened row.
 *  - Fine pointer, 768px and wider: aligned core columns, compact inline actions, the same disclosure for the full grid.
 *  - Weekly averages appear only when at least three days have the reading, and say how many days they cover.
 */
export interface WhoopHistoryListProps {
  entries: WhoopEntry[];
  onEdit: (entry: WhoopEntry) => void;
  onDelete: (id: string) => unknown | Promise<unknown>;
}

/**
 * The "Latest readings" cards above the history. Pure (no React), so the wording is testable:
 * a reading that was not recorded is "—" with NO unit (never "-%" or "-ms"); a recorded one keeps its unit.
 */
export interface LatestReading {
  /** What is drawn: "78%", "52 bpm", or "—" when not recorded. */
  text: string;
  recorded: boolean;
}

export interface LatestSubReading extends LatestReading {
  label: string;
}

export interface LatestCardModel {
  key: 'recovery' | 'heart' | 'sleep' | 'strain';
  label: string;
  main: LatestReading;
  sub: LatestSubReading;
}

const isNumber = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const NOT_RECORDED = '\u2014';

const latest = (n: number | null | undefined, format: (v: number) => string, unit = '', tight = false): LatestReading =>
  isNumber(n) ? { text: `${format(n)}${unit ? `${tight ? '' : ' '}${unit}` : ''}`, recorded: true } : { text: NOT_RECORDED, recorded: false };

const whole0 = (v: number) => fmt(v, 0);
const fixed1 = (v: number) => Number(v).toFixed(1);

export const whoopLatestCards = (e: WhoopEntry): LatestCardModel[] => [
  { key: 'recovery', label: 'Recovery', main: latest(e.recovery_score, whole0, '%', true), sub: { label: 'HRV', ...latest(e.hrv_rmssd_milli, whole0, 'ms') } },
  { key: 'heart', label: 'Heart Rate', main: latest(e.resting_heart_rate, whole0, 'bpm'), sub: { label: 'SpO2', ...latest(e.spo2_percentage, (v) => fmt(v, 1), '%', true) } },
  { key: 'sleep', label: 'Sleep', main: latest(e.sleep_performance_percentage, whole0, '%', true), sub: { label: 'In bed', ...latest(e.total_in_bed_hours, (v) => fmt(v, 1), 'h') } },
  { key: 'strain', label: 'Strain', main: latest(e.strain, fixed1), sub: { label: 'Energy', ...latest(e.kilojoule, (v) => String(caloriesFromKilojoule(v)), 'cal') } },
];

/** "Fri, Oct 30" for the "Latest reading" line: the same UTC calendar format the history rows use (never raw ISO). */
export const whoopDateLabel = (iso: string, today?: string): string => formatDay(iso, today);

const WEEKS_PER_PAGE = 4;
const DAYS_PER_PAGE = 28;
const ACTIONS_WIDTH = 'w-20';
const DESKTOP_GRID = 'grid grid-cols-[7.5rem_8rem_repeat(4,minmax(0,1fr))] items-center gap-x-4';

export const WhoopHistoryList = ({ entries, onEdit, onDelete }: WhoopHistoryListProps) => {
  const isDesktop = useMinWidth(HISTORY_MD, true);
  const today = defaultToday();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string, open: boolean) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const groups = useMemo(() => groupByWeek(sortNewestFirst(entries)), [entries]);
  const { pageGroups, page, totalPages, range, goToPage } = useGroupPagination(groups, {
    maxGroups: WEEKS_PER_PAGE,
    targetItems: DAYS_PER_PAGE,
    resetKey: '',
  });

  return (
    <div>
      {isDesktop && (
        <div aria-hidden="true" className="flex border-y py-1.5 text-xs font-medium text-muted-foreground">
          <span className={cn('min-w-0 flex-1 px-4', DESKTOP_GRID)}>
            <span>Date</span>
            <span>Recovery</span>
            <span className="text-right">HRV</span>
            <span className="text-right">Resting HR</span>
            <span className="text-right">Sleep</span>
            <span className="text-right">Strain</span>
          </span>
          <span className="w-6 shrink-0" />
          <span className={cn('shrink-0', ACTIONS_WIDTH)} />
        </div>
      )}
      {pageGroups.map((group) => {
        const week = summarizeWhoopWeek(group.items);
        const avg = (label: string, a: { mean: number; days: number } | null, decimals = 0, unit = '') =>
          a ? `Avg ${label} ${decimals > 0 ? a.mean.toFixed(decimals) : fmt(a.mean, 0)}${unit}${a.days < week.days ? ` (${a.days} of ${week.days} days)` : ''}` : null;
        return (
          <HistoryGroup
            key={group.key}
            title={
              <>
                {weekTitle(group.weekStart, today)}{' '}
                <span aria-hidden="true" className="font-normal text-muted-foreground">·</span>{' '}
                <time dateTime={isoWeekString(group.weekStart)} className="font-normal text-muted-foreground">
                  {formatWeekRange(group.weekStart, today)}
                </time>
              </>
            }
            summary={[
              `${week.days} ${week.days === 1 ? 'day' : 'days'}`,
              avg('recovery', week.recovery, 0, '%'),
              avg('HRV', week.hrv, 0, ' ms'),
              avg('strain', week.strain, 1),
            ]}
          >
            <HistoryList>
              {group.items.map((entry) => (
                <WhoopRow
                  key={entry.id}
                  entry={entry}
                  desktop={isDesktop}
                  today={today}
                  expanded={expandedIds.has(entry.id)}
                  onExpandedChange={(open) => toggleExpanded(entry.id, open)}
                  onEdit={() => onEdit(entry)}
                  onDelete={() => onDelete(entry.id)}
                />
              ))}
            </HistoryList>
          </HistoryGroup>
        );
      })}
      <HistoryPager page={page} totalPages={totalPages} unit="weeks" range={range} onPageChange={goToPage} />
    </div>
  );
};

/** "78 %" style value: number and unit, unit quieter. Unknown is a dash with a spoken "not recorded". */
const Reading = ({ cell, className }: { cell: MetricCell; className?: string }) =>
  cell.recorded ? (
    <span className={cn('tabular-nums', className)}>
      {cell.value}
      {cell.unit && <span className="font-normal text-muted-foreground">{cell.unit === '%' ? '%' : ` ${cell.unit}`}</span>}
    </span>
  ) : (
    <span className={className}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{cell.label} not recorded</span>
    </span>
  );

const MetricGrid = ({ entry }: { entry: WhoopEntry }) => (
  <div className="space-y-4">
    {whoopMetricGroups(entry).map((group) => (
      <div key={group.key} role="group" aria-label={group.label}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 min-[420px]:grid-cols-3 lg:grid-cols-5">
          {group.cells.map((cell) => (
            <div key={cell.key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{cell.label}</dt>
              <dd className="text-sm font-medium">
                <Reading cell={cell} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ))}
  </div>
);

/** One labelled reading in the phone summary. */
const Quick = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="block min-w-0">
    <span className="block text-xs text-muted-foreground">{label}</span>
    <span className="block text-sm font-semibold">{children}</span>
  </span>
);

interface WhoopRowProps {
  entry: WhoopEntry;
  desktop: boolean;
  today: string;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => unknown | Promise<unknown>;
}

const WhoopRow = ({ entry, desktop, today, expanded, onExpandedChange, onEdit, onDelete }: WhoopRowProps) => {
  const core = whoopCore(entry);
  const name = `WHOOP entry from ${entry.date}`;

  const actionList = (variant: 'tray' | 'inline') => [
    <HistoryAction key="edit" variant={variant} label={`Edit ${name}`} text="Edit" icon={<Pencil aria-hidden="true" />} onClick={onEdit} />,
    <HistoryDeleteAction
      key="delete"
      variant={variant}
      label={`Delete ${name}`}
      confirmationTitle="Delete WHOOP entry?"
      confirmationDescription={`Are you sure you want to delete all WHOOP measurements for ${entry.date}? This removes the saved entry from Fittrack, not from WHOOP.`}
      onConfirm={onDelete}
    />,
  ];

  const recoveryCell = (
    <>
      <Reading cell={core.recovery} className="text-sm font-semibold" />
      {core.band && (
        <span className="mt-1 block">
          <BandChip label={core.band} tone={recoveryTone(core.band)} />
        </span>
      )}
    </>
  );

  if (desktop) {
    return (
      <HistoryRow
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        centerChevron
        panelLabel={`All readings for ${name}`}
        panel={<MetricGrid entry={entry} />}
        summary={
          <span className={cn('w-full', DESKTOP_GRID)}>
            <span className="text-sm text-muted-foreground">
              <time dateTime={entry.date}>{formatDay(entry.date, today)}</time>
            </span>
            <span className="block">{recoveryCell}</span>
            <span className="text-right text-sm font-medium"><Reading cell={core.hrv} /></span>
            <span className="text-right text-sm font-medium"><Reading cell={core.rhr} /></span>
            <span className="text-right text-sm font-medium"><Reading cell={core.sleep} /></span>
            <span className="text-right text-sm font-medium"><Reading cell={core.strain} /></span>
          </span>
        }
        actions={
          <HistoryInlineActions label={`Actions for ${name}`} className={ACTIONS_WIDTH}>
            {actionList('inline')}
          </HistoryInlineActions>
        }
      />
    );
  }

  return (
    <HistoryRow
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      panelLabel={`Details for ${name}`}
      summary={
        <span className="flex w-full items-start gap-2.5">
          <DayStamp date={entry.date} today={today} />
          <span className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2">
            <Quick label="Recovery">{recoveryCell}</Quick>
            <Quick label="HRV"><Reading cell={core.hrv} /></Quick>
            <Quick label="Sleep"><Reading cell={core.sleep} /></Quick>
            <Quick label="Strain"><Reading cell={core.strain} /></Quick>
          </span>
        </span>
      }
      panel={
        <div className="space-y-4">
          <MetricGrid entry={entry} />
          <ActionTray label={`Actions for ${name}`}>{actionList('tray')}</ActionTray>
        </div>
      }
    />
  );
};
