import { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Equal, type LucideIcon } from 'lucide-react';
import { PageEmptyState } from '@/components/layout/Page';
import { SectionUnavailable } from '@/components/feedback/SectionUnavailable';
import type { GymSession } from '@/types';
import { cn } from '@/lib/utils';
import {
  CATEGORY_INFO,
  EXERCISE_STATUS_LABEL,
  exerciseOverview,
  soloSummary,
  buildComparison,
  buildGymSetComparison,
  formatFullDay,
  type Category,
  type ComparableEntry,
  type Delta,
  type Direction,
  type ResultsState,
  type Slot,
} from './compareModel';
import { SlotBadge } from './RecordPicker';

const DIRECTION_ICON: Record<Direction, LucideIcon> = { higher: ArrowUp, lower: ArrowDown, same: Equal };

/**
 * A change, written three ways at once: an arrow shape, a signed number with its unit, and a word.
 * It is deliberately neutral (no red or green): more or less is not good or bad by itself.
 */
export const DeltaChip = ({ delta, text, direction, className }: { delta?: Delta | null; text?: string; direction?: Direction; className?: string }) => {
  const dir = delta?.direction ?? direction;
  const label = delta?.text ?? text;
  if (!dir || !label) return null;
  const Icon = DIRECTION_ICON[dir];
  const word = delta?.word ?? (dir === 'higher' ? 'Higher' : dir === 'lower' ? 'Lower' : 'No change');
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground', className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {dir !== 'same' && <span className="sr-only"> ({word})</span>}
    </span>
  );
};

const SameMark = ({ same }: { same: boolean }) => (
  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
    {same ? <Equal className="h-3 w-3" aria-hidden="true" /> : <ArrowRight className="h-3 w-3" aria-hidden="true" />}
    {same ? 'Same' : 'Differs'}
  </span>
);

/** The shared four-column grid: field, A, B, change. On phones the A and B values sit side by side under the field name. */
const ROW_GRID = 'grid grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-[minmax(6rem,0.7fr)_1fr_1fr_minmax(7rem,0.8fr)] md:gap-x-4';

interface MatrixRowProps {
  label: string;
  same?: boolean;
  a: React.ReactNode;
  b: React.ReactNode;
  change?: React.ReactNode;
  /**
   * Phones: name the A and B values above each one (default). Long lists (sets) turn this off and show one
   * A / B header per exercise instead; the names stay available to screen readers either way.
   */
  inlineLabels?: boolean;
}

const MatrixRow = ({ label, same, a, b, change, inlineLabels = true }: MatrixRowProps) => (
  <div className={cn(ROW_GRID, 'border-b border-border/60 py-3 last:border-b-0')}>
    <dt className="col-span-2 flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground md:col-span-1 md:items-start">
      {label}
      {same !== undefined && <SameMark same={same} />}
    </dt>
    <dd className="min-w-0 break-words text-sm">
      <span className={cn('mb-0.5 block text-xs font-medium text-muted-foreground', inlineLabels ? 'md:sr-only' : 'sr-only')}>Record A</span>
      {a}
    </dd>
    <dd className="min-w-0 break-words text-sm">
      <span className={cn('mb-0.5 block text-xs font-medium text-muted-foreground', inlineLabels ? 'md:sr-only' : 'sr-only')}>Record B</span>
      {b}
    </dd>
    <dd className="col-span-2 min-w-0 empty:hidden md:col-span-1">
      {change && <span className="sr-only">Change from A to B: </span>}
      {change}
    </dd>
  </div>
);

/** Visible column titles for md and up. Hidden from assistive tech: every cell already names its column. */
const MatrixHeader = ({ aDate, bDate }: { aDate: string; bDate: string }) => (
  <div aria-hidden="true" className={cn('hidden border-b pb-2 text-xs font-medium text-muted-foreground md:grid', 'md:grid-cols-[minmax(6rem,0.7fr)_1fr_1fr_minmax(7rem,0.8fr)] md:gap-x-4')}>
    <span>Field</span>
    <span>A · {formatFullDay(aDate)}</span>
    <span>B · {formatFullDay(bDate)}</span>
    <span>Change (B − A)</span>
  </div>
);

const HeroPanel = ({ slot, date, value, label }: { slot: Slot; date: string; value: string; label: string }) => (
  <div className="min-w-0 rounded-lg border bg-muted/40 p-3 sm:p-4">
    <div className="flex items-center gap-2">
      <SlotBadge slot={slot} />
      <span className="sr-only">Record {slot}</span>
      <time dateTime={date} className="min-w-0 text-xs font-medium text-muted-foreground">
        {formatFullDay(date)}
      </time>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    <p className="break-words text-xl font-bold leading-tight text-foreground sm:text-2xl">{value}</p>
  </div>
);

const Lines = ({ lines }: { lines: string[] }) => (
  <>
    {lines.map((line, i) => (
      <span key={i} className={cn('block', i > 0 && 'text-xs text-muted-foreground')}>
        {line}
      </span>
    ))}
  </>
);

/** Phones only: one A | B header per exercise, so the set rows underneath do not repeat the labels. */
const PhoneSlotHeader = () => (
  <div aria-hidden="true" className="grid grid-cols-2 gap-x-3 border-b border-border/60 pb-1 md:hidden">
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <SlotBadge slot="A" /> Record A
    </span>
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <SlotBadge slot="B" /> Record B
    </span>
  </div>
);

const GymSets = ({ a, b }: { a: GymSession; b: GymSession }) => {
  const { exercises, timing } = buildGymSetComparison(a, b);
  const shared = exercises.filter((e) => e.status === 'same' || e.status === 'different');
  const onlyA = exercises.filter((e) => e.status === 'only-a');
  const onlyB = exercises.filter((e) => e.status === 'only-b');
  const overview = exerciseOverview(exercises);
  return (
    <div className="space-y-5">
      {timing && (
        <dl>
          <MatrixRow label="Start / End" a={timing.a} b={timing.b} />
        </dl>
      )}
      {exercises.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          These workouts have no sets saved in their notes, so only the duration can be compared.
        </p>
      )}
      {overview && <p className="text-sm text-muted-foreground">{overview}</p>}

      {shared.map((exercise) => (
        <section key={exercise.name} aria-label={`Exercise: ${exercise.name}`} className="space-y-1">
          <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {exercise.name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{EXERCISE_STATUS_LABEL[exercise.status]}</span>
          </h4>
          <PhoneSlotHeader />
          <dl>
            {exercise.sets.map((set) => (
              <MatrixRow
                key={set.label}
                label={set.label}
                same={set.same}
                inlineLabels={false}
                a={<Lines lines={set.a} />}
                b={<Lines lines={set.b} />}
                change={
                  set.changes.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {set.changes.map((c) => (
                        <DeltaChip key={c.text} text={c.text} direction={c.direction} />
                      ))}
                    </span>
                  ) : undefined
                }
              />
            ))}
            {(exercise.noteA || exercise.noteB) && (
              <MatrixRow label="Note" inlineLabels={false} a={exercise.noteA ?? 'Not logged'} b={exercise.noteB ?? 'Not logged'} />
            )}
          </dl>
        </section>
      ))}

      {([['A', onlyA], ['B', onlyB]] as const).map(
        ([slot, list]) =>
          list.length > 0 && (
            <section key={slot} aria-label={`Exercises only in record ${slot}`} className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlotBadge slot={slot} /> Only in {slot}
                <span className="text-xs font-normal text-muted-foreground">({list.length})</span>
              </h4>
              <ul role="list" className="divide-y divide-border/60 rounded-lg border">
                {list.map((exercise) => (
                  <li key={exercise.name} className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{exercise.name}</p>
                    <p className="text-xs text-muted-foreground">{soloSummary(exercise)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  );
};

interface ComparisonResultsProps {
  category: Category;
  a: ComparableEntry;
  b: ComparableEntry;
}

/**
 * Step 3, in the order a person reads it: one sentence answer, the two headline values with their dates,
 * the change between them, then the detail matrix (and for workouts, exercise by exercise).
 */
export const ComparisonResults = ({ category, a, b }: ComparisonResultsProps) => {
  const comparison = buildComparison(category, a.data, b.data);
  const { primary } = comparison;
  return (
    <div className="space-y-5">
      <p className="text-base font-semibold leading-snug text-foreground" aria-live="polite">
        {comparison.headline}
      </p>

      <div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <HeroPanel slot="A" date={a.date} value={primary.a} label={primary.label} />
          <HeroPanel slot="B" date={b.date} value={primary.b} label={primary.label} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {primary.delta && (
            <>
              <DeltaChip delta={primary.delta} className="px-2.5 py-1 text-sm" />
              <span className="text-xs text-muted-foreground">from A to B</span>
            </>
          )}
          {comparison.gap && <span className="text-xs text-muted-foreground">{comparison.gap}</span>}
        </div>
      </div>

      {(comparison.rows.length > 0 || category === 'gym') && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">{category === 'gym' ? 'Workout details' : 'Details'}</h3>
          <MatrixHeader aDate={a.date} bDate={b.date} />
          {comparison.rows.length > 0 && (
            <dl>
              {comparison.rows.map((row) => (
                <MatrixRow
                  key={row.key}
                  label={row.label}
                  same={row.same}
                  a={row.a}
                  b={row.b}
                  change={row.delta && row.delta.direction !== 'same' ? <DeltaChip delta={row.delta} /> : undefined}
                />
              ))}
            </dl>
          )}
          {category === 'gym' && (
            <div className={cn(comparison.rows.length > 0 && 'mt-4')}>
              <GymSets a={a.data as GymSession} b={b.data as GymSession} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Message for every state where there is nothing to compare yet, each one saying what to do next. */
export const ResultsGuidance = ({ state, pickedSummary, categoryLabel }: { state: ResultsState; pickedSummary?: string; categoryLabel?: string }) => {
  switch (state.kind) {
    case 'no-category':
      return <PageEmptyState icon={ArrowUp} title="Start with step 1" description="Choose a metric above. Its records appear in step 2, and the comparison shows up here." />;
    case 'unavailable':
      return (
        <SectionUnavailable
          title="The comparison is paused"
          description={`Your ${CATEGORY_INFO[state.category].noun.many} didn't load, so there is nothing to compare yet. Use Try again in step 2.`}
          minHeightClassName="min-h-[10rem]"
          className="border-dashed shadow-none"
        />
      );
    case 'no-records':
      return <PageEmptyState title={`Nothing to compare in ${categoryLabel ?? 'this metric'} yet`} description="Log at least two records first, or choose a different metric in step 1." />;
    case 'needs-two':
      return state.picked === 1 ? (
        <PageEmptyState
          icon={ArrowLeftRight}
          title="Pick one more record"
          description={`Record A is ${pickedSummary}. Tick a second record in step 2 and the comparison appears here.`}
        />
      ) : (
        <PageEmptyState icon={ArrowLeftRight} title="Pick two records" description="Tick any two records in step 2. This panel then shows what changed from A to B." />
      );
    default:
      return null;
  }
};
