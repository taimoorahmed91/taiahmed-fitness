import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { cn } from '@/lib/utils';
import { buildExerciseHistory, type ExerciseHistoryOrigin, type ExerciseHistoryRow } from '@/lib/workoutExerciseHistory';
import type { ExerciseAliases } from '@/lib/exerciseAliases';
import { GymSession } from '@/types';

interface Props {
  /** Name to show history for (a saved name or its merged name). Null = closed. */
  exercise: string | null;
  /** EVERY saved workout, not a filtered list, so the history is complete. */
  sessions: GymSession[];
  aliases: ExerciseAliases;
  /** The workout the dialog was opened from: marked "This workout" in the chart and the list. */
  origin?: ExerciseHistoryOrigin | null;
  /** Where focus goes when the dialog closes (the button that opened it). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const ORIGIN_LABEL = 'This workout';

/** One chart point. The workout the dialog was opened from is a larger ring with a text label, not just another colour. */
const HistoryDot = ({ cx, cy, index, payload, total }: { cx?: number; cy?: number; index: number; payload: ExerciseHistoryRow; total: number }) => {
  if (cx == null || cy == null) return <g />;
  if (!payload.isOrigin) return <circle cx={cx} cy={cy} r={3.5} fill="hsl(var(--chart-actual))" stroke="hsl(var(--card))" strokeWidth={1} />;
  const anchor = index === 0 && total > 1 ? 'start' : index === total - 1 && total > 1 ? 'end' : 'middle';
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={4} fill="hsl(var(--chart-actual))" />
      <text x={cx} y={cy - 14} textAnchor={anchor} fontSize={12} fontWeight={600} fill="hsl(var(--foreground))">{ORIGIN_LABEL}</text>
    </g>
  );
};

const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;

export const ExerciseHistoryDialog = ({ exercise, sessions, aliases, origin, returnFocusRef, onClose }: Props) => {
  // Keep showing the last content while the dialog fades out, instead of flashing an empty one.
  const lastRequest = useRef<{ exercise: string; origin: ExerciseHistoryOrigin | null | undefined } | null>(null);
  if (exercise) lastRequest.current = { exercise, origin };
  const shown = exercise ? { exercise, origin } : lastRequest.current;

  const shownExercise = shown?.exercise ?? null;
  const shownSessionId = shown?.origin?.sessionId;
  const shownDate = shown?.origin?.date;
  const view = useMemo(
    () => (shownExercise ? buildExerciseHistory(sessions, shownExercise, aliases, { sessionId: shownSessionId, date: shownDate }) : null),
    [shownExercise, shownSessionId, shownDate, sessions, aliases],
  );
  const history = view?.entries ?? [];
  const first = history[0];
  const last = history[history.length - 1];
  const best = history.reduce((m, h) => Math.max(m, h.topWeight), 0);
  const bestVolume = history.reduce((m, h) => Math.max(m, h.volume), 0);
  const delta = first && last ? Math.round((last.topWeight - first.topWeight) * 10) / 10 : 0;
  const originRow = view && view.originIndex >= 0 ? view.entries[view.originIndex] : null;
  const mergedNames = view ? view.names.slice(1) : [];

  const originItem = useRef<HTMLLIElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // A long history can push the workout you came from below the fold: bring it into view when the dialog opens.
  useEffect(() => {
    if (exercise && originRow) originItem.current?.scrollIntoView?.({ block: 'nearest' });
  }, [exercise, originRow]);

  const summary = view && history.length > 0
    ? `Top weight and volume across ${history.length} ${history.length === 1 ? 'workout' : 'workouts'} from ${first.date} to ${last.date}. Heaviest ${kg(best)}, best volume ${Math.round(bestVolume).toLocaleString()} kg, first to latest ${delta > 0 ? '+' : ''}${delta} kg.${originRow ? ` ${ORIGIN_LABEL}, ${originRow.date}: top weight ${kg(originRow.topWeight)}, volume ${Math.round(originRow.volume).toLocaleString()} kg.` : ''}`
    : '';

  return (
    <Dialog open={!!exercise} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        ref={contentRef}
        layout="scroll"
        closeLabel="Close exercise history"
        className="sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          // Start on the dialog itself (its title is read out), not on the first control inside the chart.
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          // Radix would refocus whatever had focus before; Safari does not focus a tapped button, so name the opener explicitly.
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-words">{view?.exercise}</DialogTitle>
          <DialogDescription className="sr-only">
            Top weight and volume for this exercise in each saved workout, oldest to newest.
          </DialogDescription>
        </DialogHeader>
        {view && (
          <div className="space-y-4">
            {view.requestedAs && (
              <p className="text-sm text-muted-foreground">
                <b className="font-medium text-foreground">{view.requestedAs}</b> is merged into <b className="font-medium text-foreground">{view.exercise}</b> on this device, so its sets are included.
              </p>
            )}
            {history.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" role="status">
                <p className="font-medium text-foreground">No weighted sets logged yet.</p>
                <p className="mt-1">
                  Only working sets with a weight count; warm-ups and bodyweight sets are left out.
                  {' '}Looked for: {view.names.join(', ')}.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">Heaviest</p><p className="break-words font-bold text-primary">{best} kg</p></div>
                  <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">Best volume</p><p className="break-words font-bold">{Math.round(bestVolume).toLocaleString()} kg</p></div>
                  <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">First → latest</p><p className="break-words font-bold">{delta > 0 ? '+' : ''}{delta} kg</p></div>
                </div>
                {history.length > 1 && (
                  <ChartFigure
                    title={`${view.exercise} history`}
                    summary={summary}
                    height={224}
                    caption={`Top weight in kg (solid line, left) and volume in kg (dashed line, right) per workout${originRow ? ` · the ringed point is ${ORIGIN_LABEL.toLowerCase()}` : ''}`}
                    table={{
                      columns: [
                        { key: 'date', label: 'Date' },
                        { key: 'topWeight', label: 'Top weight (kg)' },
                        { key: 'volume', label: 'Volume (kg)' },
                        { key: 'mark', label: 'Opened from' },
                      ],
                      rows: history.map((h) => ({ date: h.date, topWeight: h.topWeight, volume: h.volume, mark: h.isOrigin ? ORIGIN_LABEL : '' })),
                    }}
                  >
                    <ComposedChart accessibilityLayer data={history} margin={{ left: 0, right: 0, top: 22 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(d) => d.slice(5)} />
                      <YAxis yAxisId="w" width={44} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} />
                      <YAxis yAxisId="v" orientation="right" width={44} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Line yAxisId="w" type="linear" dataKey="topWeight" name="Top weight (kg)" stroke="hsl(var(--chart-actual))" strokeWidth={2.5} dot={(p) => <HistoryDot key={p.key} cx={p.cx} cy={p.cy} index={p.index} payload={p.payload} total={history.length} />} isAnimationActive={false} />
                      <Line yAxisId="v" type="linear" dataKey="volume" name="Volume (kg)" stroke="hsl(var(--chart-min))" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ChartFigure>
                )}
                <ol className="space-y-2" aria-label="Workouts, newest first">
                  {[...history].reverse().map((h) => (
                    <li
                      key={`${h.sessionId}-${h.date}`}
                      ref={h.isOrigin ? originItem : undefined}
                      aria-current={h.isOrigin ? 'true' : undefined}
                      className={cn('rounded-lg border p-3 text-sm', h.isOrigin && 'border-l-4 border-foreground/70 bg-muted/60')}
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {h.date}
                          {h.isOrigin && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <MapPin aria-hidden="true" className="h-3 w-3" />{ORIGIN_LABEL}
                            </Badge>
                          )}
                        </span>
                        <Badge variant="outline" className="max-w-full whitespace-normal break-words text-xs">{h.template}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {h.sets.map((s, j) => `S${j + 1}: ${s.reps} @ ${s.weight}kg`).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ol>
                {view.originAmbiguous && (
                  <p className="text-xs text-muted-foreground">Several workouts share the date you opened this from, so none is marked.</p>
                )}
              </>
            )}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              {mergedNames.length > 0
                ? <>Includes sets saved as {mergedNames.join(', ')}. </>
                : <>Shows only sets saved under exactly this name. </>}
              Name merges are kept on this device only, not in your account, so another phone or browser may group names differently.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
