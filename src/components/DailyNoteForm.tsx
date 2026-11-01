import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SYMPTOM_TAGS } from '@/hooks/useDailyNotes';
import type { DateRange } from 'react-day-picker';

/** Two months side by side only when there is room (Tailwind `sm`, 640px). Below that: one month. */
const WIDE_CALENDAR_QUERY = '(min-width: 640px)';

const subscribeWide = (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(WIDE_CALENDAR_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
const getWide = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_CALENDAR_QUERY).matches;
const useWideCalendar = () => useSyncExternalStore(subscribeWide, getWide, () => false);

/**
 * Scrolls a popover back to its top (month header and arrows visible). Opening the calendar focuses a day
 * inside it, and the browser scrolls that day into view, which in short landscape windows left the popover
 * scrolled to the bottom. Radix also resizes the popover a moment after it opens, so we reset a few times.
 * Returns a function that cancels any resets still waiting.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper, exported so tests can drive it
export const scheduleScrollTopReset = (getEl: () => { scrollTop: number } | null | undefined, delays: number[] = [0, 50, 150]) => {
  const reset = () => {
    const el = getEl();
    if (el) el.scrollTop = 0;
  };
  reset();
  const timers = delays.map((ms) => setTimeout(reset, ms));
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(reset) : undefined;
  return () => {
    timers.forEach(clearTimeout);
    if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
  };
};

interface DailyNoteFormProps {
  /**
   * Resolve `false` when the save did NOT happen: the form then keeps everything the person typed and says so.
   * Anything else (`true`, or no value from an older handler) counts as saved and clears the form.
   */
  onSubmit: (note: { date: string; tags: string[]; severity?: number | null; notes?: string }) => void | boolean | Promise<boolean | void>;
}

export const DailyNoteForm = ({ onSubmit }: DailyNoteFormProps) => {
  const uid = useId();
  const dateId = `${uid}-date`;
  const tagsLabelId = `${uid}-tags-label`;
  const severityLabelId = `${uid}-severity-label`;
  const severityHintId = `${uid}-severity-hint`;
  const notesId = `${uid}-notes`;
  const wideCalendar = useWideCalendar();
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [dateOpen, setDateOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [range, setRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // A ref, not state: it blocks a second submit in the same frame, before React has re-rendered.
  const inFlight = useRef(false);

  // Every time the date popover opens, or the mode / month count changes while it is open, start at the top.
  useEffect(() => {
    if (!dateOpen) return;
    return scheduleScrollTopReset(() => popoverRef.current);
  }, [dateOpen, mode, wideCalendar]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (selectedTags.length === 0 && !notes.trim()) {
      return;
    }

    const dates: Date[] =
      mode === 'single'
        ? [date]
        : range?.from
          ? eachDayOfInterval({ start: range.from, end: range.to ?? range.from })
          : [];

    if (dates.length === 0) return;

    inFlight.current = true;
    setSaving(true);
    setSaveFailed(false);
    let failed = false;
    try {
      // One day at a time: the first failure stops the run and the draft stays, so nothing is lost or half-reported.
      for (const d of dates) {
        const result = await onSubmit({
          date: format(d, 'yyyy-MM-dd'),
          tags: selectedTags,
          severity,
          notes: notes.trim() || undefined,
        });
        if (result === false) {
          failed = true;
          break;
        }
      }
    } catch {
      failed = true;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }

    if (failed) {
      setSaveFailed(true);
      return;
    }
    // Reset form
    setSelectedTags([]);
    setSeverity(null);
    setNotes('');
  };

  const rangeLabel =
    range?.from
      ? range.to && format(range.to, 'yyyy-MM-dd') !== format(range.from, 'yyyy-MM-dd')
        ? `${format(range.from, 'PPP')} — ${format(range.to, 'PPP')}`
        : format(range.from, 'PPP')
      : 'Pick a date range';

  const rangeCount =
    mode === 'range' && range?.from
      ? eachDayOfInterval({ start: range.from, end: range.to ?? range.from }).length
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus aria-hidden="true" className="h-5 w-5 text-primary" />
          Add Daily Note
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2" role="group" aria-label="Date mode">
            <Button
              type="button"
              variant={mode === 'single' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              aria-pressed={mode === 'single'}
              onClick={() => setMode('single')}
            >
              Single Date
            </Button>
            <Button
              type="button"
              variant={mode === 'range' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              aria-pressed={mode === 'range'}
              onClick={() => setMode('range')}
            >
              Date Range
            </Button>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor={dateId}>{mode === 'single' ? 'Date' : 'Date Range'}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={dateId}
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                  {mode === 'single' ? (
                    date ? format(date, 'PPP') : <span>Pick a date</span>
                  ) : (
                    <span>{rangeLabel}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={popoverRef}
                // Never taller or wider than the space Radix has left, so it scrolls instead of clipping
                // on small phones and in landscape. collisionPadding keeps it off the screen edges.
                className="max-h-[var(--radix-popover-content-available-height)] w-auto max-w-[min(var(--radix-popover-content-available-width),calc(100vw-1rem))] overflow-auto overscroll-contain p-0"
                align="start"
                collisionPadding={8}
              >
                {mode === 'single' ? (
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                ) : (
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    initialFocus
                    numberOfMonths={wideCalendar ? 2 : 1}
                    className="p-3 pointer-events-auto"
                  />
                )}
              </PopoverContent>
            </Popover>
            {mode === 'range' && rangeCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Will save the same note for {rangeCount} day{rangeCount === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          {/* Quick Tags */}
          <div className="space-y-2" role="group" aria-labelledby={tagsLabelId}>
            <span id={tagsLabelId} className="text-sm font-medium leading-none">Symptoms / Tags</span>
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_TAGS.map((tag) => (
                <ToggleChip key={tag} pressed={selectedTags.includes(tag)} onPressedChange={() => toggleTag(tag)}>
                  {tag}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="space-y-2" role="group" aria-labelledby={severityLabelId} aria-describedby={severityHintId}>
            <span id={severityLabelId} className="text-sm font-medium leading-none">Severity (optional)</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={severity === level ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  aria-pressed={severity === level}
                  onClick={() => setSeverity(severity === level ? null : level)}
                >
                  {level}
                </Button>
              ))}
            </div>
            <p id={severityHintId} className="text-xs text-muted-foreground">1 = Mild, 5 = Severe</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor={notesId}>Additional Notes (optional)</Label>
            <Textarea
              id={notesId}
              placeholder="Any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={10000}
              rows={5}
            />
          </div>

          {saveFailed && (
            <p role="alert" className="text-sm text-destructive">
              The note was not saved. What you wrote is still here, so you can try again.
            </p>
          )}
          <Button type="submit" className="w-full" loading={saving} loadingText="Saving…" disabled={selectedTags.length === 0 && !notes.trim()}>
            Save Note
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
