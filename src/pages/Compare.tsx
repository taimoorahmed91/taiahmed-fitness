import { useCallback, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { PartialDataNotice } from '@/components/feedback/PartialDataNotice';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { useSharedTableState } from '@/lib/sharedTable';
import { CategoryPicker } from '@/components/compare/CategoryPicker';
import { ComparisonResults, ResultsGuidance } from '@/components/compare/ComparisonResults';
import { RecordPicker } from '@/components/compare/RecordPicker';
import { StepSection } from '@/components/compare/StepSection';
import {
  CATEGORY_INFO,
  CATEGORY_ORDER,
  buildEntries,
  categoryAvailability,
  noticeCategories,
  pruneSelection,
  resultsState,
  swapSelection,
  toggleSelection,
  type Category,
} from '@/components/compare/compareModel';

const RESULTS_ID = 'compare-results';

/**
 * Compare: a three-step workspace.
 *   1. choose a metric  2. tick two records (A and B)  3. read what changed from A to B
 * On phones the steps stack; from `lg` the records sit beside the comparison so both stay in view.
 */
const Compare = () => {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { meals, refetch: refetchMeals } = useMeals();
  const { sessions: gymSessions, refetch: refetchGym } = useGymSessions();
  const { entries: weightEntries, refetch: refetchWeight } = useWeight();
  const { entries: sleepEntries, refetch: refetchSleep } = useSleep();

  // Where each source really is. A failed first load means the records are UNKNOWN, which must never read
  // as "none logged"; a failed refresh over loaded rows only means they may be out of date.
  const availability = categoryAvailability({
    meals: useSharedTableState('meals'),
    gym: useSharedTableState('gym_sessions'),
    weight: useSharedTableState('weight'),
    sleep: useSharedTableState('sleep'),
  });
  const retryers: Record<Category, () => Promise<void>> = { meals: refetchMeals, gym: refetchGym, weight: refetchWeight, sleep: refetchSleep };

  const entries = useMemo(
    () => buildEntries(selectedCategory, { meals, gym: gymSessions, weight: weightEntries, sleep: sleepEntries }),
    [selectedCategory, meals, gymSessions, weightEntries, sleepEntries],
  );

  const view = selectedCategory ? availability[selectedCategory].view : 'ready';
  // Counts only mean something once that source has loaded.
  const loaded = { meals: meals.length, gym: gymSessions.length, weight: weightEntries.length, sleep: sleepEntries.length };
  const counts: Partial<Record<Category, number>> = Object.fromEntries(CATEGORY_ORDER.filter((id) => availability[id].view === 'ready').map((id) => [id, loaded[id]]));
  const notice = noticeCategories(availability, selectedCategory);
  // Reload only what failed or went stale. Joins any fetch already running and never rejects.
  const retryNotice = async () => {
    await Promise.all([...notice.failed, ...notice.stale].map((id) => retryers[id]()));
  };

  // A record deleted elsewhere must not leave a ghost pick behind.
  const activeIds = useMemo(() => pruneSelection(selectedIds, new Set(entries.map((e) => e.id))), [selectedIds, entries]);
  const picked = useMemo(() => activeIds.map((id) => entries.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e), [activeIds, entries]);

  const state = resultsState({ category: selectedCategory, view, recordCount: entries.length, pickedCount: picked.length });
  const info = selectedCategory ? CATEGORY_INFO[selectedCategory] : null;

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setSelectedIds([]);
  };
  const handleReset = () => {
    setSelectedCategory(null);
    setSelectedIds([]);
  };
  const handleToggle = (id: string) => setSelectedIds((prev) => toggleSelection(prev, id));
  const handleRemove = (id: string) => setSelectedIds((prev) => prev.filter((x) => x !== id));

  // Phones: the comparison is below the list. Move there, and put focus on its heading so keyboard and screen reader users arrive too.
  const jumpToResults = useCallback(() => {
    const section = document.getElementById(RESULTS_ID);
    if (!section) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, []);

  return (
    <PageContainer>
      <PageHeader
        icon={ArrowLeftRight}
        title="Compare Entries"
        description="Put two records side by side and see what changed"
        actions={
          selectedCategory && (
            <Button variant="outline" onClick={handleReset}>
              Start over
            </Button>
          )
        }
      />

      {/* One persistent notice (not a toast) for every OTHER failed or stale source. The open metric explains itself in step 2. */}
      <PartialDataNotice
        failed={notice.failed.map((id) => CATEGORY_INFO[id].noun.many)}
        stale={notice.stale.map((id) => CATEGORY_INFO[id].noun.many)}
        onRetry={retryNotice}
      />

      <StepSection
        step={1}
        title="Choose a metric"
        hint={info ? `Comparing ${info.label.toLowerCase()}. Pick another metric any time to start a new comparison.` : 'What do you want to compare?'}
        done={!!selectedCategory}
      >
        <CategoryPicker value={selectedCategory} onChange={handleCategorySelect} counts={counts} availability={availability} />
      </StepSection>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start">
        <StepSection
          step={2}
          title="Select two records"
          hint={selectedCategory && view !== 'error' ? `Tick two ${info!.noun.many}. A is the first pick and B is the second.` : undefined}
          done={picked.length === 2}
        >
          {selectedCategory && view === 'error' ? (
            <DataLoadError
              title={`We couldn't load your ${info!.noun.many}`}
              description="Nothing was lost. Check your connection and try again; the other metrics are unaffected."
              onRetry={retryers[selectedCategory]}
              minHeightClassName="min-h-[12rem]"
              className="border-dashed shadow-none"
            />
          ) : selectedCategory ? (
            <RecordPicker
              key={selectedCategory}
              category={selectedCategory}
              entries={entries}
              loading={view === 'loading'}
              selectedIds={activeIds}
              picked={picked}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onSwap={() => setSelectedIds(swapSelection(activeIds))}
              onClear={() => setSelectedIds([])}
              onJumpToResults={jumpToResults}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Choose a metric in step 1 and its records are listed here.</p>
          )}
        </StepSection>

        <StepSection
          id={RESULTS_ID}
          step={3}
          title="Inspect the comparison"
          hint={state.kind === 'ready' ? 'Change is worked out as B minus A.' : undefined}
          done={state.kind === 'ready'}
        >
          {state.kind === 'ready' && selectedCategory ? (
            <ComparisonResults category={selectedCategory} a={picked[0]} b={picked[1]} />
          ) : state.kind === 'loading' ? (
            <p role="status" className="text-sm text-muted-foreground">Loading records…</p>
          ) : (
            <ResultsGuidance state={state} pickedSummary={picked[0]?.summary} categoryLabel={info?.label.toLowerCase()} />
          )}
        </StepSection>
      </div>
    </PageContainer>
  );
};

export default Compare;
