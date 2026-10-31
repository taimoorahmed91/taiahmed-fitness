import { useMemo, useState } from 'react';
import { Meal } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { FilterDisclosure } from '@/components/ui/filter-disclosure';
import { Input } from '@/components/ui/input';
import { Pencil, Search, X, Copy, Zap } from 'lucide-react';
import { useMealFavorites } from '@/hooks/useMealFavorites';
import { SortControl } from '@/components/SortControl';
import { MealNutrientFilter } from '@/components/MealNutrientFilter';
import { emptyNutrientFilter, matchesNutrientFilter } from '@/lib/mealNutrientFilter';
import { GroupStat, HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow, TimelineNode } from '@/components/history/HistoryRow';
import { DateBadge } from '@/components/history/DayStamp';
import { ActionTray, HistoryAction, HistoryDeleteAction, HistoryInlineActions } from '@/components/history/ActionTray';
import { HistoryPager } from '@/components/history/HistoryPager';
import { useGroupPagination } from '@/components/history/useGroupPagination';
import { HISTORY_MD, useMinWidth } from '@/components/history/useMinWidth';
import { formatClock, formatDay, formatShortDay, relativeDayLabel, defaultToday } from '@/lib/historyDates';
import {
  countMealsByDate,
  describeMacroTotal,
  describeMealDay,
  formatCount,
  groupMealsByDate,
  sortMealsByCalories,
  sortMealsNewestFirst,
  type MealDayGroup,
} from '@/lib/mealHistory';
import { cn } from '@/lib/utils';

interface MealListProps {
  meals: Meal[];
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
  onCopy?: (meal: Meal) => void;
  caloriesRemainingToday?: number;
}

/** Days per page and a soft row target: a page closes at 7 days or ~30 meals, never in the middle of a day. */
const DAYS_PER_PAGE = 7;
const MEALS_PER_PAGE = 30;
/** Flat (calorie-sorted) lists have no days, so they page by plain row count. */
const FLAT_PER_PAGE = 20;

/** Desktop ledger columns: Time, timeline node, Food, Protein, Carbs, Calories. The inline-actions cell sits after them. */
const DESKTOP_COLUMNS = 'grid min-h-6 w-full grid-cols-[3.5rem_0.75rem_minmax(0,1fr)_4rem_4rem_4.5rem] items-baseline gap-x-3';
const DESKTOP_ACTIONS_WIDTH = 'w-36';

export const MealList = ({ meals, onDelete, onEdit, onCopy, caloriesRemainingToday }: MealListProps) => {
  const { isFavorite, toggleFavorite } = useMealFavorites();
  const isDesktop = useMinWidth(HISTORY_MD, true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [calorieFilter, setCalorieFilter] = useState(emptyNutrientFilter);
  const [proteinFilter, setProteinFilter] = useState(emptyNutrientFilter);
  const [carbFilter, setCarbFilter] = useState(emptyNutrientFilter);
  const [excludeBeforeNoon, setExcludeBeforeNoon] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (id: string, open: boolean) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  // Sorting by calories turns the day grouping off (the list is "flat"); otherwise it is newest day first.
  const flat = sortOrder !== null;

  const sortedMeals = useMemo(
    () => (sortOrder ? sortMealsByCalories(meals, sortOrder) : sortMealsNewestFirst(meals)),
    [meals, sortOrder],
  );

  const filteredMeals = useMemo(
    () =>
      sortedMeals.filter((meal) => {
        if (searchTerm && !meal.food.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (dateFilter && meal.date !== dateFilter) return false;
        if (!matchesNutrientFilter(meal.calories, calorieFilter)) return false;
        if (!matchesNutrientFilter(meal.protein, proteinFilter)) return false;
        if (!matchesNutrientFilter(meal.carbs, carbFilter)) return false;
        if (excludeBeforeNoon && meal.time < '12:00') return false;
        return true;
      }),
    [sortedMeals, searchTerm, dateFilter, calorieFilter, proteinFilter, carbFilter, excludeBeforeNoon],
  );

  const mealsPerDate = useMemo(() => countMealsByDate(meals), [meals]);

  // Pages are made of whole days (or, when sorted by calories, of plain rows).
  const groups = useMemo<MealDayGroup[]>(
    () =>
      flat
        ? filteredMeals.map((meal) => ({ key: meal.id, date: meal.date, items: [meal] }))
        : groupMealsByDate(filteredMeals),
    [flat, filteredMeals],
  );
  const resetKey = JSON.stringify([searchTerm, dateFilter, calorieFilter, proteinFilter, carbFilter, excludeBeforeNoon, sortOrder]);
  const { pageGroups, page, totalPages, range, goToPage } = useGroupPagination(groups, {
    maxGroups: flat ? FLAT_PER_PAGE : DAYS_PER_PAGE,
    targetItems: flat ? FLAT_PER_PAGE : MEALS_PER_PAGE,
    resetKey,
  });

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setCalorieFilter(emptyNutrientFilter());
    setProteinFilter(emptyNutrientFilter());
    setCarbFilter(emptyNutrientFilter());
    setExcludeBeforeNoon(false);
  };

  const nutrientActive = (f: typeof calorieFilter) => f.min !== '' || (f.mode === 'range' && f.max !== '');
  // Filters that live inside the collapsible panel on phones (search stays visible, so it is not counted here).
  const panelFilterCount =
    (dateFilter ? 1 : 0) +
    (excludeBeforeNoon ? 1 : 0) +
    [calorieFilter, proteinFilter, carbFilter].filter(nutrientActive).length;
  const hasActiveFilters = !!searchTerm || panelFilterCount > 0;

  const budgetLimit = caloriesRemainingToday !== undefined ? Math.max(0, Math.floor(caloriesRemainingToday)) : null;
  const budgetFilterOn =
    budgetLimit !== null && calorieFilter.mode === 'range' && calorieFilter.min === '0' && calorieFilter.max === String(budgetLimit);

  const today = defaultToday();

  const renderRow = (meal: Meal) => (
    <MealRow
      key={meal.id}
      meal={meal}
      desktop={isDesktop}
      showDate={flat}
      today={today}
      expanded={expandedIds.has(meal.id)}
      onExpandedChange={(open) => toggleExpanded(meal.id, open)}
      favorite={isFavorite(meal.food)}
      onToggleFavorite={() => toggleFavorite(meal.food)}
      onDelete={onDelete}
      onEdit={onEdit}
      onCopy={onCopy}
    />
  );

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Recent Meals</CardTitle>
          <div className="flex items-center gap-2">
            <SortControl label="Calories" sortOrder={sortOrder} onSortChange={setSortOrder} />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {caloriesRemainingToday !== undefined && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-muted/50 px-3 py-2">
            <p className="text-sm" aria-live="polite">
              <span className="text-muted-foreground">Today: </span>
              {caloriesRemainingToday >= 0 ? (
                <span className="font-semibold text-primary">{Math.floor(caloriesRemainingToday)} cal remaining</span>
              ) : (
                <span className="font-semibold text-destructive">{Math.ceil(Math.abs(caloriesRemainingToday))} cal over budget</span>
              )}
            </p>
            <ToggleChip
              pressed={budgetFilterOn}
              onPressedChange={(on) => setCalorieFilter(on ? { mode: 'range', min: '0', max: String(budgetLimit) } : emptyNutrientFilter())}
            >
              Fits today's budget (≤ {budgetLimit} cal)
            </ToggleChip>
          </div>
        )}

        <FilterDisclosure
          className="mt-3"
          activeCount={panelFilterCount}
          leading={
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by food name..."
                aria-label="Search meals by food name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          }
        >
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="sm:w-44"
            aria-label="Filter by date"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MealNutrientFilter label="Calories" unit="cal" value={calorieFilter} onChange={setCalorieFilter} />
            <MealNutrientFilter label="Protein" unit="g" value={proteinFilter} onChange={setProteinFilter} />
            <MealNutrientFilter label="Carbs" unit="g" value={carbFilter} onChange={setCarbFilter} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ToggleChip pressed={excludeBeforeNoon} onPressedChange={setExcludeBeforeNoon}>
              Exclude meals before noon
            </ToggleChip>
          </div>
        </FilterDisclosure>
        {hasActiveFilters && meals.length > 0 && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Showing {filteredMeals.length} of {meals.length} meals
          </p>
        )}
        {flat && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Sorted by calories ({sortOrder === 'desc' ? 'highest' : 'lowest'} first). Day grouping and daily totals are off while sorting; sort again to turn it off.
          </p>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {filteredMeals.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 px-4">
            {meals.length === 0 ? 'No meals logged yet' : 'No meals match your filters'}
          </p>
        ) : (
          <>
            {isDesktop && <DesktopColumnHeader showDate={flat} />}
            {flat ? (
              <HistoryList variant="meal" className="border-y py-1">{pageGroups.map((group) => renderRow(group.items[0]))}</HistoryList>
            ) : (
              <div>
                {pageGroups.map((group) => {
                  const context = describeMealDay(group.items, mealsPerDate[group.date] ?? group.items.length, hasActiveFilters);
                  const relative = relativeDayLabel(group.date, today);
                  const totals = context.kind === 'totals' ? context.totals : null;
                  // A gentle cue on today's heading, from the same "remaining" figure the banner above uses. Words, not colour.
                  const todayCue =
                    totals && group.date === today && caloriesRemainingToday !== undefined
                      ? caloriesRemainingToday >= 0
                        ? `${formatCount(Math.floor(caloriesRemainingToday))} cal left`
                        : `${formatCount(Math.ceil(Math.abs(caloriesRemainingToday)))} cal over`
                      : null;
                  return (
                    <HistoryGroup
                      key={group.key}
                      variant="meal"
                      // On wide screens the day total sits right above the Calories column (inline actions are 9rem, row padding 1rem).
                      bandClassName={isDesktop ? 'sm:pr-[calc(9rem+1rem)]' : undefined}
                      marker={<DateBadge date={group.date} highlight={relative === 'Today'} />}
                      title={
                        <>
                          {relative && (
                            <>
                              {relative} <span aria-hidden="true" className="font-normal text-muted-foreground">·</span>{' '}
                            </>
                          )}
                          <time dateTime={group.date} className={relative ? 'font-normal text-muted-foreground' : undefined}>
                            {formatDay(group.date, today)}
                          </time>
                        </>
                      }
                      stat={totals ? <GroupStat value={formatCount(totals.calories)} unit="cal" label={todayCue ?? 'day total'} /> : undefined}
                      summary={
                        totals
                          ? [
                              describeMacroTotal('protein', totals.protein),
                              describeMacroTotal('carbs', totals.carbs),
                              `${totals.count} ${totals.count === 1 ? 'meal' : 'meals'}`,
                            ]
                          : context.kind === 'filtered'
                            ? [
                                context.shown === context.ofDay
                                  ? `${context.shown} ${context.shown === 1 ? 'meal' : 'meals'} shown`
                                  : `${context.shown} of ${context.ofDay} meals shown`,
                              ]
                            : []
                      }
                    >
                      <HistoryList variant="meal" className="py-1">{group.items.map(renderRow)}</HistoryList>
                    </HistoryGroup>
                  );
                })}
              </div>
            )}
          </>
        )}
        <HistoryPager page={page} totalPages={totalPages} unit={flat ? 'meals' : 'days'} range={range} onPageChange={goToPage} />
      </CardContent>
    </Card>
  );
};

const DesktopColumnHeader = ({ showDate }: { showDate: boolean }) => (
  <div aria-hidden="true" className="flex border-b px-0 py-1.5 text-xs font-medium text-muted-foreground">
    <span className={cn(DESKTOP_COLUMNS, 'min-w-0 flex-1 px-4')}>
      <span>{showDate ? 'Date / time' : 'Time'}</span>
      <span />
      <span>Food</span>
      <span className="text-right">Protein</span>
      <span className="text-right">Carbs</span>
      <span className="text-right">Calories</span>
    </span>
    <span className={cn('shrink-0', DESKTOP_ACTIONS_WIDTH)} />
  </div>
);

/** "38 g protein · 70 g carbs", skipping anything not logged. Unknown is left out, never shown as 0. */
const MacroLine = ({ meal }: { meal: Meal }) => {
  const parts: string[] = [];
  if (meal.protein != null) parts.push(`${formatCount(meal.protein)} g protein`);
  if (meal.carbs != null) parts.push(`${formatCount(meal.carbs)} g carbs`);
  if (parts.length === 0) return null;
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {parts.map((part, i) => (
        <span key={part}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <span className="whitespace-nowrap">{part}</span>
        </span>
      ))}
    </span>
  );
};

const MacroCell = ({ value, label }: { value: number | null | undefined; label: string }) => (
  <span className="text-right text-sm tabular-nums text-muted-foreground">
    {value != null ? (
      <>
        {formatCount(value)} g<span className="sr-only"> {label}</span>
      </>
    ) : (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{label} not logged</span>
      </>
    )}
  </span>
);

/**
 * A meal pinned to Quick add. Says so in words (with a filled bolt and a border), so it never depends on colour.
 * Screen readers get the same words they always did.
 */
const PinnedBadge = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium leading-none text-foreground', className)}>
    <Zap aria-hidden="true" className="h-3 w-3 shrink-0 fill-primary text-primary" />
    <span aria-hidden="true">Quick add</span>
    <span className="sr-only"> (pinned to quick add)</span>
  </span>
);

interface MealRowProps {
  meal: Meal;
  desktop: boolean;
  /** Show the date next to the time (the flat, calorie-sorted list has no day headings). */
  showDate: boolean;
  today: string;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
  onCopy?: (meal: Meal) => void;
}

const MealRow = ({ meal, desktop, showDate, today, expanded, onExpandedChange, favorite, onToggleFavorite, onDelete, onEdit, onCopy }: MealRowProps) => {
  const clock = formatClock(meal.time) ?? meal.time;

  const timeCell = (
    <span className="block">
      {showDate && (
        <time dateTime={meal.date} className="block text-xs font-normal leading-tight text-muted-foreground">
          {formatShortDay(meal.date, today)}
        </time>
      )}
      <time dateTime={clock}>{clock}</time>
    </span>
  );

  // The same actions in either shape: labelled tray buttons on phones, compact icons on wide screens.
  const actionList = (variant: 'tray' | 'inline') => [
    ...(onCopy
      ? [
          <HistoryAction
            key="copy"
            variant={variant}
            label={`Copy ${meal.food} to form`}
            text="Copy"
            icon={<Copy aria-hidden="true" />}
            emphasis
            onClick={() => onCopy(meal)}
          />,
        ]
      : []),
    <HistoryAction
      key="pin"
      variant={variant}
      label={`Pin ${meal.food} to quick add`}
      text="Quick add"
      tooltip={favorite ? 'Remove from quick add' : 'Add to quick add'}
      pressed={favorite}
      icon={<Zap aria-hidden="true" className={favorite ? 'fill-primary text-primary' : variant === 'inline' ? 'text-muted-foreground' : undefined} />}
      onClick={onToggleFavorite}
    />,
    <HistoryAction
      key="edit"
      variant={variant}
      label={`Edit ${meal.food}`}
      text="Edit"
      icon={<Pencil aria-hidden="true" />}
      onClick={() => onEdit(meal)}
    />,
    <HistoryDeleteAction
      key="delete"
      variant={variant}
      label={`Delete ${meal.food}`}
      confirmationTitle="Delete meal?"
      confirmationDescription={`Are you sure you want to delete “${meal.food}” from ${meal.date} at ${meal.time}? This cannot be undone.`}
      onConfirm={() => onDelete(meal.id)}
    />,
  ];

  // Flat (calorie-sorted) lists mix days, so there is no timeline to draw.
  const node = showDate ? null : <TimelineNode variant="meal" open={expanded} />;

  if (desktop) {
    return (
      <HistoryRow
        variant="meal"
        className="[@media(hover:hover)]:hover:bg-accent/30"
        summary={
          <span className={DESKTOP_COLUMNS}>
            <span className="text-sm font-medium tabular-nums text-foreground">{timeCell}</span>
            {node ?? <span aria-hidden="true" />}
            <span className="min-w-0 break-words whitespace-pre-wrap text-sm font-medium">
              {meal.food}
              {favorite && <PinnedBadge className="ml-2" />}
            </span>
            <MacroCell value={meal.protein} label="protein" />
            <MacroCell value={meal.carbs} label="carbs" />
            <span className="text-right text-base font-semibold tabular-nums">
              {formatCount(meal.calories)}
              <span className="sr-only"> calories</span>
            </span>
          </span>
        }
        actions={
          <HistoryInlineActions label={`Actions for ${meal.food}`} className={DESKTOP_ACTIONS_WIDTH}>
            {actionList('inline')}
          </HistoryInlineActions>
        }
      />
    );
  }

  return (
    <HistoryRow
      variant="meal"
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      summary={
        <span className="flex min-h-6 w-full items-start gap-2">
          <span className={cn('shrink-0 pt-0.5 text-sm font-medium tabular-nums text-foreground', showDate ? 'w-14' : 'w-11')}>{timeCell}</span>
          {node}
          <span className="min-w-0 flex-1">
            <span className={cn('block break-words whitespace-pre-wrap text-sm font-medium', !expanded && 'line-clamp-2')}>{meal.food}</span>
            <MacroLine meal={meal} />
            {favorite && (
              <span className="mt-1 block">
                <PinnedBadge />
              </span>
            )}
          </span>
          <span className="shrink-0 text-right leading-tight">
            <span className="block text-lg font-semibold tabular-nums">{formatCount(meal.calories)}</span>
            <span className="block text-xs text-muted-foreground">cal</span>
          </span>
        </span>
      }
      panel={<ActionTray label={`Actions for ${meal.food}`}>{actionList('tray')}</ActionTray>}
    />
  );
};
