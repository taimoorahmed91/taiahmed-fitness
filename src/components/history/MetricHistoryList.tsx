import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus, Moon, Pencil, Ruler } from 'lucide-react';
import { GroupGlyph, GroupStat, HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow, TimelineNode } from '@/components/history/HistoryRow';
import type { HistoryVariant } from '@/components/history/historyVariants';
import { ActionTray, HistoryAction, HistoryDeleteAction, HistoryInlineActions } from '@/components/history/ActionTray';
import { HistoryPager } from '@/components/history/HistoryPager';
import { useGroupPagination } from '@/components/history/useGroupPagination';
import { HISTORY_MD, useMinWidth } from '@/components/history/useMinWidth';
import { DayStamp } from '@/components/history/DayStamp';
import { BandChip } from '@/components/history/BandChip';
import { SleepBar } from '@/components/history/SleepBar';
import { defaultToday, formatDay, formatShortDay } from '@/lib/historyDates';
import {
  buildChangeMap,
  countBy,
  formatChange,
  groupByMonth,
  monthKey,
  monthTitle,
  sortNewestFirst,
  spokenChange,
  type BandTone,
  type Change,
} from '@/lib/bodyHistory';
import { cn } from '@/lib/utils';

/**
 * One history list for the single-number diaries (Weight, Waist, Sleep).
 *
 *  - Grouped by calendar month, newest first. Value sorting is a flat list (no month headings or facts).
 *  - Phone: date-led row, the measurement large and right-aligned, the quiet extras (change from the previous
 *    entry or a quality band, then notes) beside it. Tapping the row opens its full notes and a labelled Edit / Delete tray.
 *  - Fine pointer, 768px and wider: aligned Date / Value / Change-or-Quality / Notes columns with compact inline actions.
 *  - Change from the previous entry is a plain, neutral difference (never good/bad, never colour).
 *  - Paging is by whole months, so a month's heading always describes everything under it.
 *
 * `variant` gives each diary its own look on top of that same structure:
 *  - "default"      plain grey (Weight). Unchanged.
 *  - "sleep"        a calm lavender-tinted band with a moon, a quality word, and a thin duration bar per night.
 *  - "measurement"  a neutral ruler: an axis with a tick per reading, the number large, the change as a plain chip.
 *    Neither adds good/bad colour. The duration bar is only a picture of the number beside it, never a target.
 */
export interface MetricEntry {
  id: string;
  date: string;
  notes?: string | null;
}

export interface EntryBand {
  label: string;
  tone: BandTone;
  /** What the band means, shown when a row is opened. */
  rule?: string;
}

export interface MetricHistoryListProps<T extends MetricEntry> {
  /** What to show (already filtered by the page). */
  entries: T[];
  /** Every entry, unfiltered. Changes are measured against this, and months are counted from it. */
  allEntries: T[];
  sortOrder: 'asc' | 'desc' | null;
  /** Lower-case name of the sort, for the note: "weight", "hours". */
  sortName: string;
  getValue: (entry: T) => number;
  /** Column heading: "Weight". */
  valueLabel: string;
  /** Short unit after the number: "kg", "cm", "h". */
  unit: string;
  /** Spoken unit for the change sentence: "kilograms". */
  spokenUnit: string;
  /** "weight entry": names every action, for example "Edit weight entry from 2026-10-29". */
  entryNoun: string;
  /** What one row is called in counts: "entry" / "entries", "night" / "nights". */
  countNoun: { one: string; many: string };
  /** Show the change from the previous entry (Weight, Waist). */
  showChange?: boolean;
  /** Show a quality band (Sleep). */
  band?: (entry: T) => EntryBand | null;
  /** Month heading facts for a month shown in full. Only called when nothing is filtered out of it. */
  monthFacts?: (items: T[]) => ReactNode[];
  /** One headline number for a month shown in full (shown large on the right of the month heading). */
  monthStat?: (items: T[]) => MonthStat | null;
  variant?: Extract<HistoryVariant, 'default' | 'sleep' | 'measurement'>;
  deleteTitle: string;
  deleteDescription: (entry: T) => string;
  onEdit: (entry: T) => void;
  onDelete: (id: string) => unknown | Promise<unknown>;
}

export interface MonthStat {
  value: string;
  unit?: string;
  /** Says what the number is: "avg per night", "range". */
  label: string;
}

const MONTHS_PER_PAGE = 3;
const ENTRIES_PER_PAGE = 40;
const FLAT_PER_PAGE = 20;
const ACTIONS_WIDTH = 'w-20';
/** Notes longer than this can run past two lines on a wide row, so that row can be opened to read them all. */
const LONG_NOTE = 80;

interface PageGroup<T> {
  key: string;
  month?: string;
  items: T[];
}

export const MetricHistoryList = <T extends MetricEntry>(props: MetricHistoryListProps<T>) => {
  const {
    entries, allEntries, sortOrder, sortName, getValue, valueLabel, unit, spokenUnit, entryNoun, countNoun,
    showChange = false, band, monthFacts, monthStat, variant = 'default', deleteTitle, deleteDescription, onEdit, onDelete,
  } = props;
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

  const flat = sortOrder !== null;
  const filtersActive = allEntries.length !== entries.length;

  const newestFirstAll = useMemo(() => sortNewestFirst(allEntries), [allEntries]);
  const changes = useMemo(() => (showChange ? buildChangeMap(newestFirstAll, getValue) : new Map<string, Change>()), [showChange, newestFirstAll, getValue]);
  const oldestId = newestFirstAll[newestFirstAll.length - 1]?.id;

  const ordered = useMemo(
    () => (sortOrder ? [...entries].sort((a, b) => (sortOrder === 'asc' ? getValue(a) - getValue(b) : getValue(b) - getValue(a))) : sortNewestFirst(entries)),
    [entries, sortOrder, getValue],
  );
  const groups = useMemo<PageGroup<T>[]>(
    () => (flat ? ordered.map((entry) => ({ key: entry.id, items: [entry] })) : groupByMonth(ordered)),
    [flat, ordered],
  );
  const perMonth = useMemo(() => countBy(allEntries, (e) => monthKey(e.date)), [allEntries]);
  const { pageGroups, page, totalPages, range, goToPage } = useGroupPagination(groups, {
    maxGroups: flat ? FLAT_PER_PAGE : MONTHS_PER_PAGE,
    targetItems: flat ? FLAT_PER_PAGE : ENTRIES_PER_PAGE,
    resetKey: `${sortOrder}|${allEntries.length - entries.length}`,
  });

  const hasExtra = showChange || !!band;
  const extraLabel = showChange ? 'Change' : band ? 'Quality' : null;
  // Only the measurement look draws an axis (and only in month groups: a value-sorted list mixes months).
  const axis = variant === 'measurement' && !flat;
  const grid = desktopGrid(hasExtra, axis);

  const renderRow = (entry: T) => (
    <MetricRow
      key={entry.id}
      entry={entry}
      variant={variant}
      axis={axis}
      grid={grid}
      desktop={isDesktop}
      flat={flat}
      today={today}
      expanded={expandedIds.has(entry.id)}
      onExpandedChange={(open) => toggleExpanded(entry.id, open)}
      value={getValue(entry)}
      unit={unit}
      spokenUnit={spokenUnit}
      entryNoun={entryNoun}
      change={changes.get(entry.id)}
      isFirstEver={showChange && entry.id === oldestId && newestFirstAll.length > 1}
      band={band?.(entry) ?? null}
      hasExtra={hasExtra}
      deleteTitle={deleteTitle}
      deleteDescription={deleteDescription(entry)}
      onEdit={() => onEdit(entry)}
      onDelete={() => onDelete(entry.id)}
    />
  );

  const glyph = variant === 'sleep' ? <Moon aria-hidden="true" /> : variant === 'measurement' ? <Ruler aria-hidden="true" /> : null;

  return (
    <div>
      {flat && (
        <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">
          Sorted by {sortName} ({sortOrder === 'desc' ? 'highest' : 'lowest'} first). Month grouping is off while sorting; sort again to turn it off.
        </p>
      )}
      {isDesktop && (
        <div aria-hidden="true" className="flex border-y py-1.5 text-xs font-medium text-muted-foreground">
          <span className={cn('min-w-0 flex-1 px-4', grid)}>
            {axis && <span />}
            <span>Date</span>
            <span className="text-right">{valueLabel}</span>
            {extraLabel && <span>{extraLabel}</span>}
            <span>Notes</span>
          </span>
          <span className="w-6 shrink-0" />
          <span className={cn('shrink-0', ACTIONS_WIDTH)} />
        </div>
      )}
      {flat ? (
        <HistoryList variant={variant} className={isDesktop ? 'border-b' : 'border-y'}>{pageGroups.map((g) => renderRow(g.items[0]))}</HistoryList>
      ) : (
        pageGroups.map((group) => {
          const inMonth = perMonth[group.month ?? ''] ?? group.items.length;
          const partial = filtersActive;
          const noun = group.items.length === 1 ? countNoun.one : countNoun.many;
          const facts = partial
            ? [group.items.length === inMonth ? `${group.items.length} ${noun} shown` : `${group.items.length} of ${inMonth} ${inMonth === 1 ? countNoun.one : countNoun.many} shown`]
            : [`${group.items.length} ${noun}`, ...(monthFacts ? monthFacts(group.items) : [])];
          const stat = partial ? null : monthStat?.(group.items) ?? null;
          return (
            <HistoryGroup
              key={group.key}
              variant={variant}
              marker={glyph ? <GroupGlyph variant={variant}>{glyph}</GroupGlyph> : undefined}
              stat={stat ? <GroupStat value={stat.value} unit={stat.unit} label={stat.label} /> : undefined}
              title={<time dateTime={group.month}>{monthTitle(group.month ?? group.key)}</time>}
              summary={facts}
            >
              <HistoryList variant={variant} className={variant === 'default' ? undefined : 'py-1'}>{group.items.map(renderRow)}</HistoryList>
            </HistoryGroup>
          );
        })
      )}
      <HistoryPager page={page} totalPages={totalPages} unit={flat ? countNoun.many : 'months'} range={range} onPageChange={goToPage} />
    </div>
  );
};

/** Desktop columns: [axis] Date, Value, [Change or Quality], Notes. */
const desktopGrid = (hasExtra: boolean, axis: boolean): string => {
  if (axis) {
    return hasExtra
      ? 'grid grid-cols-[0.75rem_7.5rem_6rem_9rem_minmax(0,1fr)] items-start gap-x-4'
      : 'grid grid-cols-[0.75rem_7.5rem_6rem_minmax(0,1fr)] items-start gap-x-4';
  }
  return hasExtra ? 'grid grid-cols-[7.5rem_6rem_9rem_minmax(0,1fr)] items-start gap-x-4' : 'grid grid-cols-[7.5rem_6rem_minmax(0,1fr)] items-start gap-x-4';
};

/** The change from the previous entry as a neutral chip: an arrow for direction, never a colour for good or bad. */
const ChangeChip = ({ delta, text }: { delta: number; text: string }) => {
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground">
      <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
};

interface MetricRowProps<T extends MetricEntry> {
  entry: T;
  variant: 'default' | 'sleep' | 'measurement';
  axis: boolean;
  grid: string;
  desktop: boolean;
  flat: boolean;
  today: string;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  value: number;
  unit: string;
  spokenUnit: string;
  entryNoun: string;
  change?: Change;
  isFirstEver: boolean;
  band: EntryBand | null;
  hasExtra: boolean;
  deleteTitle: string;
  deleteDescription: string;
  onEdit: () => void;
  onDelete: () => unknown | Promise<unknown>;
}

const MetricRow = <T extends MetricEntry>({
  entry, variant, axis, grid, desktop, flat, today, expanded, onExpandedChange, value, unit, spokenUnit, entryNoun, change, isFirstEver,
  band, hasExtra, deleteTitle, deleteDescription, onEdit, onDelete,
}: MetricRowProps<T>) => {
  const notes = entry.notes?.trim() || '';
  const sinceText = change ? formatShortDay(change.previousDate, today) : '';
  const changeText = change ? formatChange(change.delta, unit) : null;
  const sentence = change ? spokenChange(change, spokenUnit, 2, sinceText) : null;
  const name = `${entryNoun} from ${entry.date}`;
  const showBar = variant === 'sleep';
  const showChip = variant === 'measurement';

  const actionList = (kind: 'tray' | 'inline') => [
    <HistoryAction key="edit" variant={kind} label={`Edit ${name}`} text="Edit" icon={<Pencil aria-hidden="true" />} onClick={onEdit} />,
    <HistoryDeleteAction
      key="delete"
      variant={kind}
      label={`Delete ${name}`}
      confirmationTitle={deleteTitle}
      confirmationDescription={deleteDescription}
      onConfirm={onDelete}
    />,
  ];

  const valueText = (
    <>
      {String(value)}
      <span className="font-normal text-muted-foreground"> {unit}</span>
    </>
  );

  if (desktop) {
    const longNote = notes.length > LONG_NOTE || notes.includes('\n');
    return (
      <HistoryRow
        variant={variant}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        reserveChevron
        panelLabel={`Notes for ${name}`}
        panel={longNote ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground"><span className="sr-only">Notes: </span>{notes}</p> : undefined}
        summary={
          <span className={cn('min-h-6', grid)}>
            {axis && <TimelineNode variant="measurement" kind="tick" />}
            <span className="text-sm text-muted-foreground">
              <time dateTime={entry.date}>{formatDay(entry.date, today)}</time>
            </span>
            <span className={cn('text-right font-semibold tabular-nums', variant === 'default' ? 'text-sm' : 'text-base')}>
              {valueText}
              {showBar && <SleepBar hours={value} className="mt-1" />}
            </span>
            {change && changeText ? (
              <span className="text-sm tabular-nums">
                {showChip ? <ChangeChip delta={change.delta} text={changeText} /> : changeText}
                <span className="mt-0.5 block text-xs text-muted-foreground">since {sinceText}</span>
                <span className="sr-only">{sentence}</span>
              </span>
            ) : band ? (
              <span><BandChip label={band.label} tone={band.tone} /></span>
            ) : hasExtra ? (
              <span className="text-sm text-muted-foreground">{isFirstEver ? 'First entry' : <><span aria-hidden="true">—</span><span className="sr-only">no previous entry</span></>}</span>
            ) : null}
            <span className={cn('min-w-0 break-words whitespace-pre-wrap text-sm text-muted-foreground', !expanded && 'line-clamp-2')}>
              {notes || <><span aria-hidden="true">—</span><span className="sr-only">no notes</span></>}
            </span>
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
      variant={variant}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      panelLabel={`Details for ${name}`}
      summary={
        <span className="flex min-h-6 w-full items-start gap-2.5">
          <DayStamp date={entry.date} withMonth={flat} today={today} />
          {axis && <TimelineNode variant="measurement" kind="tick" />}
          <span className="min-w-0 flex-1 space-y-1">
            {band && (
              <span className="block">
                <BandChip label={band.label} tone={band.tone} />
              </span>
            )}
            {showBar && <SleepBar hours={value} className="max-w-40" />}
            {changeText && change && (
              <span className="block text-xs tabular-nums text-muted-foreground">
                {showChip ? <ChangeChip delta={change.delta} text={changeText} /> : changeText}{' '}
                since {sinceText}
              </span>
            )}
            {!change && isFirstEver && <span className="block text-xs text-muted-foreground">First entry</span>}
            {notes && (
              <span className={cn('block break-words whitespace-pre-wrap text-xs text-muted-foreground', !expanded && 'line-clamp-2')}>
                <span className="sr-only">Notes: </span>
                {notes}
              </span>
            )}
          </span>
          <span className="shrink-0 text-right leading-tight">
            <span className={cn('block font-semibold tabular-nums', variant === 'default' ? 'text-base' : 'text-xl')}>{String(value)}</span>{' '}
            <span className="block text-xs text-muted-foreground">{unit}</span>
          </span>
        </span>
      }
      panel={
        <div className="space-y-3">
          {sentence && <p className="text-sm text-muted-foreground">{sentence}</p>}
          {band?.rule && (
            <p className="text-sm text-muted-foreground">
              {band.label}: {band.rule}. Bands go by hours slept only.
            </p>
          )}
          <ActionTray label={`Actions for ${name}`}>{actionList('tray')}</ActionTray>
        </div>
      }
    />
  );
};
