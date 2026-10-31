import { useMemo, useState, type ReactNode } from 'react';
import { GymSession } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardPlus, Dumbbell, ListChecks, Pencil } from 'lucide-react';
import { GroupGlyph, HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { WeekPattern } from '@/components/history/WeekPattern';
import { HistoryRow } from '@/components/history/HistoryRow';
import { ActionTray, HistoryAction, HistoryDeleteAction, HistoryInlineActions } from '@/components/history/ActionTray';
import { HistoryPager } from '@/components/history/HistoryPager';
import { useGroupPagination } from '@/components/history/useGroupPagination';
import { HISTORY_LG, useMinWidth } from '@/components/history/useMinWidth';
import { WorkoutDetail } from '@/components/history/WorkoutDetail';
import { defaultToday, formatDay, formatWeekRange, isoWeekString, weekTitle } from '@/lib/historyDates';
import {
  countSessionsByWeek,
  formatKg,
  formatMinutes,
  groupSessionsByWeek,
  sortSessionsNewestFirst,
  summarizeSession,
  summarizeWeek,
  trainedDays,
  type SessionSummary,
} from '@/lib/workoutHistory';
import { cn } from '@/lib/utils';

interface GymListProps {
  /** The sessions to show (already filtered by the page). */
  sessions: GymSession[];
  /**
   * Every session before filtering. Lets a week say "2 of 4 workouts shown" instead of presenting a filtered
   * subset as the whole week. Defaults to `sessions` (nothing filtered).
   */
  allSessions?: GymSession[];
  onDelete: (id: string) => void;
  onEdit: (session: GymSession) => void;
  onCreateTemplate?: (session: GymSession) => void;
}

/** A page closes at 4 weeks or ~20 workouts, never in the middle of a week. */
const WEEKS_PER_PAGE = 4;
const WORKOUTS_PER_PAGE = 20;

/** Desktop columns: Date, Workout, Time, Duration, Exercises, Sets, Volume. */
const DESKTOP_COLUMNS = 'grid w-full grid-cols-[6.5rem_minmax(0,1fr)_7rem_4.5rem_4.5rem_3.5rem_6.5rem] items-start gap-x-3';
const DESKTOP_ACTIONS_WIDTH = 'w-28';

export const GymList = ({ sessions, allSessions, onDelete, onEdit, onCreateTemplate }: GymListProps) => {
  const isDesktop = useMinWidth(HISTORY_LG, true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const today = defaultToday();

  const toggleExpanded = (id: string, open: boolean) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const everySession = allSessions ?? sessions;
  const filtered = everySession.length !== sessions.length;

  const groups = useMemo(() => groupSessionsByWeek(sortSessionsNewestFirst(sessions)), [sessions]);
  const sessionsPerWeek = useMemo(() => countSessionsByWeek(everySession), [everySession]);
  const { pageGroups, page, totalPages, range, goToPage } = useGroupPagination(groups, {
    maxGroups: WEEKS_PER_PAGE,
    targetItems: WORKOUTS_PER_PAGE,
    resetKey: String(everySession.length - sessions.length),
  });

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Workout History</CardTitle>
        {filtered && (
          <p role="status" className="text-xs text-muted-foreground">
            Showing {sessions.length} of {everySession.length} workouts
          </p>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 px-4">
            {everySession.length === 0 ? 'No workouts logged yet' : 'No workouts match your filters'}
          </p>
        ) : (
          <>
            {isDesktop && <DesktopColumnHeader />}
            <div>
              {pageGroups.map((group) => {
                const totals = summarizeWeek(group.items);
                const inWeek = sessionsPerWeek[group.weekStart] ?? group.items.length;
                // Only a week shown in full can say which days were trained; a filtered week would be guessing.
                const partial = filtered && group.items.length !== inWeek;
                return (
                  <HistoryGroup
                    key={group.key}
                    variant="workout"
                    marker={
                      <GroupGlyph variant="workout">
                        <Dumbbell aria-hidden="true" />
                      </GroupGlyph>
                    }
                    stat={partial ? undefined : <WeekPattern days={trainedDays(group.items, group.weekStart)} />}
                    stackStatOnNarrow
                    title={
                      <>
                        {weekTitle(group.weekStart, today)}{' '}
                        <span aria-hidden="true" className="font-normal text-muted-foreground">·</span>{' '}
                        <time dateTime={isoWeekString(group.weekStart)} className="font-normal text-muted-foreground">
                          {formatWeekRange(group.weekStart, today)}
                        </time>
                      </>
                    }
                    summary={
                      partial
                        ? [`${group.items.length} of ${inWeek} workouts shown`]
                        : [
                            <span key="count" className="font-semibold text-foreground">
                              {totals.count} {totals.count === 1 ? 'workout' : 'workouts'}
                            </span>,
                            totals.minutes !== null ? formatMinutes(totals.minutes) : null,
                          ]
                    }
                  >
                    <HistoryList variant="workout">
                      {group.items.map((session) => (
                        <GymSessionRow
                          key={session.id}
                          session={session}
                          desktop={isDesktop}
                          today={today}
                          expanded={expandedIds.has(session.id)}
                          onExpandedChange={(open) => toggleExpanded(session.id, open)}
                          onDelete={onDelete}
                          onEdit={onEdit}
                          onCreateTemplate={onCreateTemplate}
                        />
                      ))}
                    </HistoryList>
                  </HistoryGroup>
                );
              })}
            </div>
          </>
        )}
        <HistoryPager page={page} totalPages={totalPages} unit="weeks" range={range} onPageChange={goToPage} />
      </CardContent>
    </Card>
  );
};

const DesktopColumnHeader = () => (
  <div aria-hidden="true" className="flex border-b py-1.5 text-xs font-medium text-muted-foreground">
    <span className={cn(DESKTOP_COLUMNS, 'min-w-0 flex-1 px-4')}>
      <span>Date</span>
      <span>Workout</span>
      <span>Time</span>
      <span className="text-right">Duration</span>
      <span className="text-right">Exercises</span>
      <span className="text-right">Sets</span>
      <span className="text-right">Volume</span>
    </span>
    {/* Same width as the chevron and the inline actions in each row. */}
    <span className="w-6 shrink-0" />
    <span className={cn('shrink-0', DESKTOP_ACTIONS_WIDTH)} />
  </div>
);

/** Volume as shown in a row: "8,450 kg", or "≥ 8,450 kg" when only some sets had a weight. */
const VolumeText = ({ summary }: { summary: SessionSummary }) => {
  const stats = summary.stats;
  if (!stats || stats.volumeKg === null) return null;
  return stats.volumePartial ? (
    <span title="Counts only the sets that have a weight">
      <span aria-hidden="true">≥ </span>
      <span className="sr-only">At least </span>
      {formatKg(stats.volumeKg)}
    </span>
  ) : (
    <>{formatKg(stats.volumeKg)}</>
  );
};

const NotAvailable = () => (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">not available</span>
  </>
);

interface GymSessionRowProps {
  session: GymSession;
  desktop: boolean;
  today: string;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (session: GymSession) => void;
  onCreateTemplate?: (session: GymSession) => void;
}

const GymSessionRow = ({ session, desktop, today, expanded, onExpandedChange, onDelete, onEdit, onCreateTemplate }: GymSessionRowProps) => {
  const summary = useMemo(() => summarizeSession(session), [session]);
  const { stats } = summary;

  const actionList = (variant: 'tray' | 'inline') => [
    ...(onCreateTemplate
      ? [
          <HistoryAction
            key="template"
            variant={variant}
            label={`Create template from ${session.exercise}`}
            text="Make template"
            icon={<ClipboardPlus aria-hidden="true" className={variant === 'inline' ? 'text-primary' : undefined} />}
            onClick={() => onCreateTemplate(session)}
            className={variant === 'tray' ? 'col-span-2' : undefined}
          />,
        ]
      : []),
    <HistoryAction
      key="edit"
      variant={variant}
      label={`Edit ${session.exercise}`}
      text="Edit"
      icon={<Pencil aria-hidden="true" />}
      onClick={() => onEdit(session)}
    />,
    <HistoryDeleteAction
      key="delete"
      variant={variant}
      label={`Delete ${session.exercise}`}
      confirmationTitle="Delete workout?"
      confirmationDescription={`Are you sure you want to delete “${session.exercise}” from ${session.date}? Its recorded sets, weights, times and notes will be removed. This cannot be undone.`}
      onConfirm={() => onDelete(session.id)}
    />,
  ];

  const detail = <WorkoutDetail parsed={summary.parsed} hasNotes={summary.hasNotes} />;

  if (desktop) {
    return (
      <HistoryRow
        variant="workout"
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        reserveChevron
        panelLabel={`Details for ${session.exercise}`}
        panel={summary.hasNotes ? detail : undefined}
        summary={
          <span className={DESKTOP_COLUMNS}>
            <span className="text-sm text-muted-foreground">
              <time dateTime={session.date}>{formatDay(session.date, today)}</time>
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold">{session.exercise}</span>
              {summary.preview && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary.preview}</span>}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">{summary.timeRange ?? <NotAvailable />}</span>
            <span className="text-right text-sm font-medium tabular-nums">{summary.minutes !== null ? formatMinutes(summary.minutes) : <NotAvailable />}</span>
            <span className="text-right text-sm tabular-nums">{stats ? stats.exerciseCount : <NotAvailable />}</span>
            <span className="text-right text-sm tabular-nums">{stats && stats.setCount > 0 ? stats.setCount : <NotAvailable />}</span>
            <span className="text-right text-sm font-semibold tabular-nums">
              <VolumeText summary={summary} />
              {(!stats || stats.volumeKg === null) && <NotAvailable />}
            </span>
          </span>
        }
        actions={
          <HistoryInlineActions label={`Actions for ${session.exercise}`} className={DESKTOP_ACTIONS_WIDTH}>
            {actionList('inline')}
          </HistoryInlineActions>
        }
      />
    );
  }

  // The headline numbers, as a strip of small value-over-label cells.
  const facts: { key: string; value: ReactNode; label: string }[] = [];
  if (summary.minutes !== null) facts.push({ key: 'min', value: formatMinutes(summary.minutes), label: 'duration' });
  if (stats) {
    facts.push({ key: 'ex', value: stats.exerciseCount, label: stats.exerciseCount === 1 ? 'exercise' : 'exercises' });
    if (stats.setCount > 0) facts.push({ key: 'sets', value: stats.setCount, label: stats.setCount === 1 ? 'set' : 'sets' });
    if (stats.volumeKg !== null) facts.push({ key: 'vol', value: <VolumeText summary={summary} />, label: 'volume' });
  }

  return (
    <HistoryRow
      variant="workout"
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      panelLabel={`Details for ${session.exercise}`}
      summary={
        <span className="block w-full min-w-0">
          <span className="block break-words text-base font-semibold leading-snug">{session.exercise}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            <time dateTime={session.date}>{formatDay(session.date, today)}</time>
            {summary.timeRange && (
              <>
                {' '}
                <span aria-hidden="true">·</span> <span className="tabular-nums">{summary.timeRange}</span>
              </>
            )}
          </span>
          {facts.length > 0 && (
            <span className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 tabular-nums min-[480px]:flex min-[480px]:flex-wrap min-[480px]:gap-x-5 min-[480px]:gap-y-2">
              {facts.map((fact) => (
                <span key={fact.key} className="block border-l-2 border-chart-2/50 pl-2 leading-tight">
                  <span className="block text-sm font-semibold">{fact.value}</span>{' '}
                  <span className="block text-xs text-muted-foreground">{fact.label}</span>
                </span>
              ))}
            </span>
          )}
          {summary.preview && !expanded && (
            <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListChecks aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{summary.preview}</span>
            </span>
          )}
        </span>
      }
      panel={
        <div className="space-y-4">
          {summary.hasNotes && detail}
          <ActionTray label={`Actions for ${session.exercise}`}>{actionList('tray')}</ActionTray>
        </div>
      }
    />
  );
};
