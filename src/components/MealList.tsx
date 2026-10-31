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
import { HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow } from '@/components/history/HistoryRow';
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

/** Desktop ledger columns: Time, Food, Protein, Carbs, Calories. The inline-actions cell sits after them. */
const DESKTOP_COLUMNS = 'grid w-full grid-cols-[3.5rem_minmax(0,1fr)_4rem_4rem_4.5rem] items-baseline gap-x-3';
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
              <HistoryList className="border-y">{pageGroups.map((group) => renderRow(group.items[0]))}</HistoryList>
            ) : (
              <div>
                {pageGroups.map((group) => {
                  const context = describeMealDay(group.items, mealsPerDate[group.date] ?? group.items.length, hasActiveFilters);
                  const relative = relativeDayLabel(group.date, today);
                  return (
                    <HistoryGroup
                      key={group.key}
                      title={
                        <>
                          {relative && (
                            <>
                              {relative} <span aria-hidden="true" className="font-normal text-muted-foreground">·</span>{' '}
                            </>
                          )}
                          <time dateTime={group.date}>{formatDay(group.date, today)}</time>
                        </>
                      }
                      summary={
                        context.kind === 'totals'
                          ? [
                              <span key="cal" className="font-semibold tabular-nums text-foreground">{formatCount(context.totals.calories)} cal</span>,
                              describeMacroTotal('protein', context.totals.protein),
                              describeMacroTotal('carbs', context.totals.carbs),
                              `${context.totals.count} ${context.totals.count === 1 ? 'meal' : 'meals'}`,
                            ]
                          : [
                              context.shown === context.ofDay
                                ? `${context.shown} ${context.shown === 1 ? 'meal' : 'meals'} shown`
                                : `${context.shown} of ${context.ofDay} meals shown`,
                            ]
                      }
                    >
                      <HistoryList>{group.items.map(renderRow)}</HistoryList>
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
        <time dateTime={meal.date} className="block text-xs leading-tight">
          {formatShortDay(meal.date, today)}
        </time>
      )}
      <time dateTime={clock}>{clock}</time>
    </span>
  );

  const pinned = favorite ? (
    <>
      <Zap aria-hidden="true" className="ml-1 inline h-3.5 w-3.5 fill-primary text-primary" />
      <span className="sr-only"> (pinned to quick add)</span>
    </>
  ) : null;

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

  if (desktop) {
    return (
      <HistoryRow
        className="[@media(hover:hover)]:hover:bg-muted/40"
        summary={
          <span className={DESKTOP_COLUMNS}>
            <span className="text-sm tabular-nums text-muted-foreground">{timeCell}</span>
            <span className="min-w-0 break-words whitespace-pre-wrap text-sm font-medium">
              {meal.food}
              {pinned}
            </span>
            <MacroCell value={meal.protein} label="protein" />
            <MacroCell value={meal.carbs} label="carbs" />
            <span className="text-right text-sm font-semibold tabular-nums">
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
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      summary={
        <span className="flex w-full items-start gap-2.5">
          <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">{timeCell}</span>
          <span className="min-w-0 flex-1">
            <span className={cn('block break-words whitespace-pre-wrap text-sm font-medium', !expanded && 'line-clamp-2')}>
              {meal.food}
              {pinned}
            </span>
            <MacroLine meal={meal} />
          </span>
          <span className="shrink-0 text-right leading-tight">
            <span className="block text-base font-semibold tabular-nums">{formatCount(meal.calories)}</span>
            <span className="block text-xs text-muted-foreground">cal</span>
          </span>
        </span>
      }
      panel={<ActionTray label={`Actions for ${meal.food}`}>{actionList('tray')}</ActionTray>}
    />
  );
};
