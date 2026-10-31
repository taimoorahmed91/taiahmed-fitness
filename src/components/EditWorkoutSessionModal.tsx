import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, StickyNote, Trash2 } from 'lucide-react';
import { GymSession } from '@/types';
import { SetColumnHeader, WorkoutSetRow } from '@/components/workout/WorkoutSetRow';
import { fieldInputId, fieldOrder, nextInOrder, type AnyExerciseKey } from '@/lib/workoutSession';
import { cn } from '@/lib/utils';
import { confirmedSuccess, SAVE_FAILED_MESSAGE } from '@/lib/confirmedMutation';

type SetN = 1 | 2 | 3 | 4 | 5 | 6;
const SET_NUMS: SetN[] = [1, 2, 3, 4, 5, 6];

type SetField = 'warmup' | 'set1' | 'set2' | 'set3' | 'set4' | 'set5' | 'set6';
type WeightField =
  | 'warmupWeight'
  | 'set1Weight'
  | 'set2Weight'
  | 'set3Weight'
  | 'set4Weight'
  | 'set5Weight'
  | 'set6Weight';
type TimeField =
  | 'warmupTime'
  | 'set1Time'
  | 'set2Time'
  | 'set3Time'
  | 'set4Time'
  | 'set5Time'
  | 'set6Time';

type ExerciseSets = Partial<Record<SetField | WeightField, string>>;
type ExerciseTimestamps = Partial<Record<TimeField, string>>;

interface ParsedExercise {
  seq?: number;
  name: string;
  sets: ExerciseSets;
  timestamps: ExerciseTimestamps;
  note: string;
  visibleSets: number; // 3..6
}

interface ParsedSession {
  startTime: string;
  endTime: string;
  exercises: ParsedExercise[];
}

const parseSessionNotes = (notes: string | undefined): ParsedSession => {
  const result: ParsedSession = { startTime: '', endTime: '', exercises: [] };
  if (!notes) return result;

  const parts = notes.split(' | ').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (/^Start:/i.test(part) && !part.includes(': S') && !part.includes(': W')) {
      const sm = part.match(/Start:\s*(\d{1,2}:\d{2})/i);
      const em = part.match(/End:\s*(\d{1,2}:\d{2})/i);
      if (sm) result.startTime = sm[1];
      if (em) result.endTime = em[1];
      continue;
    }

    let working = part;
    let noteText = '';
    const noteMatch = working.match(/\s*\[note:\s*([^\]]*)\]\s*$/i);
    if (noteMatch) {
      noteText = noteMatch[1].trim();
      working = working.slice(0, noteMatch.index).trim();
    }

    const colonIdx = working.indexOf(':');
    if (colonIdx === -1) continue;

    let header = working.slice(0, colonIdx).trim();
    const setsText = working.slice(colonIdx + 1).trim();

    let seq: number | undefined;
    const seqMatch = header.match(/^(\d+)\.(.*)$/);
    if (seqMatch) {
      seq = parseInt(seqMatch[1], 10);
      header = seqMatch[2].trim();
    }

    const sets: ExerciseSets = {};
    const timestamps: ExerciseTimestamps = {};
    let maxSet = 3;

    // Warmup: W:<reps>[@<weight>kg][@HH:mm]
    const wMatch = setsText.match(
      /(?:^|\s)W:(\d+(?:\.\d+)?)(?:@(\d+(?:\.\d+)?)kg)?(?:@(\d{1,2}:\d{2}))?/
    );
    if (wMatch) {
      sets.warmup = wMatch[1];
      if (wMatch[2]) sets.warmupWeight = wMatch[2];
      if (wMatch[3]) timestamps.warmupTime = wMatch[3];
    }

    // S<n>:<reps>[@<weight>kg][@HH:mm]
    const setRegex =
      /S([1-6]):(\d+(?:\.\d+)?)(?:@(\d+(?:\.\d+)?)kg)?(?:@(\d{1,2}:\d{2}))?/g;
    let m: RegExpExecArray | null;
    while ((m = setRegex.exec(setsText)) !== null) {
      const [, n, reps, weight, time] = m;
      const num = parseInt(n, 10);
      sets[`set${num}` as SetField] = reps;
      if (weight) sets[`set${num}Weight` as WeightField] = weight;
      if (time) timestamps[`set${num}Time` as TimeField] = time;
      if (num > maxSet) maxSet = num;
    }

    result.exercises.push({
      seq,
      name: header,
      sets,
      timestamps,
      note: noteText,
      visibleSets: maxSet,
    });
  }

  result.exercises.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
  return result;
};

const formatSessionNotes = (data: ParsedSession): string => {
  const lines: string[] = [];
  if (data.startTime || data.endTime) {
    lines.push(`Start:${data.startTime || ''} End:${data.endTime || ''}`);
  }
  data.exercises.forEach((ex, i) => {
    const seq = ex.seq ?? i + 1;
    const tokens: string[] = [];

    const warmupReps = (ex.sets.warmup || '').trim();
    if (warmupReps) {
      const w = (ex.sets.warmupWeight || '').trim();
      const t = (ex.timestamps.warmupTime || '').trim();
      tokens.push(`W:${warmupReps}${w ? `@${w}kg` : ''}${t ? `@${t}` : ''}`);
    }

    for (let n = 1; n <= ex.visibleSets; n++) {
      const reps = (ex.sets[`set${n}` as SetField] || '').trim();
      if (!reps) continue;
      const w = (ex.sets[`set${n}Weight` as WeightField] || '').trim();
      const t = (ex.timestamps[`set${n}Time` as TimeField] || '').trim();
      tokens.push(`S${n}:${reps}${w ? `@${w}kg` : ''}${t ? `@${t}` : ''}`);
    }

    const setsText = tokens.join(' ');
    if (!setsText && !ex.note.trim()) return;
    const cleanNote = ex.note.trim().replace(/[[\]|]/g, '');
    const noteSuffix = cleanNote ? ` [note: ${cleanNote}]` : '';
    lines.push(`${seq}.${ex.name}: ${setsText}${noteSuffix}`);
  });
  return lines.join(' | ');
};

const sanitizeDecimal = (raw: string): string => {
  let v = raw.replace(',', '.');
  v = v.replace(/[^0-9.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  return v;
};

const nowHHMM = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

// Find the latest HH:MM timestamp across all parsed set entries.
const getLastSetHHMM = (p: ParsedSession): string | null => {
  let bestMin = -1;
  let best: string | null = null;
  for (const ex of p.exercises) {
    const stamps: (string | undefined)[] = [
      ex.timestamps.warmupTime,
      ex.timestamps.set1Time,
      ex.timestamps.set2Time,
      ex.timestamps.set3Time,
      ex.timestamps.set4Time,
      ex.timestamps.set5Time,
      ex.timestamps.set6Time,
    ];
    for (const t of stamps) {
      if (!t || !/^\d{1,2}:\d{2}$/.test(t)) continue;
      const [h, m] = t.split(':').map((x) => parseInt(x, 10));
      const mins = h * 60 + m;
      if (mins > bestMin) {
        bestMin = mins;
        best = t;
      }
    }
  }
  return best;
};

// Build an ISO timestamp anchor from a date (YYYY-MM-DD) and HH:MM.
// Handles end-time-before-start (workout crossed midnight) by adding 24h.
const buildAnchorIso = (date: string, hhmm: string, startHHMM?: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  let ms = new Date(`${date}T${hhmm}:00`).getTime();
  if (Number.isNaN(ms)) return null;
  if (startHHMM && /^\d{1,2}:\d{2}$/.test(startHHMM)) {
    const startMs = new Date(`${date}T${startHHMM}:00`).getTime();
    if (!Number.isNaN(startMs) && ms < startMs) {
      ms += 24 * 60 * 60 * 1000;
    }
  }
  return new Date(ms).toISOString();
};

interface EditWorkoutSessionModalProps {
  session: GymSession | null;
  open: boolean;
  onClose: () => void;
  /** Must resolve `true` only when the change was confirmed. `false`, anything else, or a rejection keeps this dialog open. */
  onSave: (id: string, updates: Partial<Omit<GymSession, 'id'>>) => Promise<boolean> | boolean;
}

export const EditWorkoutSessionModal = ({
  session,
  open,
  onClose,
  onSave,
}: EditWorkoutSessionModalProps) => {
  const [exerciseName, setExerciseName] = useState('');
  const [duration, setDuration] = useState('');
  const [date, setDate] = useState('');
  const [startTimeField, setStartTimeField] = useState('');
  const [originalStartTime, setOriginalStartTime] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [endAnchorIso, setEndAnchorIso] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSession>({
    startTime: '',
    endTime: '',
    exercises: [],
  });
  const [expanded, setExpanded] = useState<number | null>(0);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savingRef = useRef(false);
  // Track which fields the user edited in this session — those get the green border
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (session && open) {
      setExerciseName(session.exercise);
      setDuration(session.duration.toString());
      setDate(session.date);
      setStartTimeField(session.start_time || '');
      setOriginalStartTime(session.start_time || '');
      setOriginalDate(session.date);

      const p = parseSessionNotes(session.notes);
      if (!p.startTime && session.start_time) p.startTime = session.start_time;
      setParsed(p);

      // Determine end-time anchor priority:
      //   1) Latest set timestamp parsed from notes (wall-clock truth)
      //   2) Stored end_time column
      //   3) start_time + duration fallback (legacy)
      let anchor: string | null = null;
      const lastSet = getLastSetHHMM(p);
      if (lastSet) {
        anchor = buildAnchorIso(session.date, lastSet, session.start_time || undefined);
      }
      if (!anchor && session.end_time) {
        anchor = session.end_time;
      }
      if (!anchor && session.start_time && session.duration && /^\d{1,2}:\d{2}$/.test(session.start_time)) {
        const startMs = new Date(`${session.date}T${session.start_time}:00`).getTime();
        if (!Number.isNaN(startMs)) {
          anchor = new Date(startMs + session.duration * 60_000).toISOString();
        }
      }
      setEndAnchorIso(anchor);

      setExpanded(p.exercises.length > 0 ? 0 : null);
      setShowAddExercise(false);
      setNewExerciseName('');
      setTouched({});
      setSaveFailed(false);
    }
  }, [session, open]);

  // Keep the anchor in sync with edits to set timestamps inside the modal.
  useEffect(() => {
    const lastSet = getLastSetHHMM(parsed);
    if (!lastSet) return;
    const anchor = buildAnchorIso(date, lastSet, startTimeField || undefined);
    if (anchor) setEndAnchorIso(anchor);
  }, [parsed, date, startTimeField]);

  // Live preview: whenever we have an end anchor and a valid start time, show
  // the computed duration so the user sees what will be saved.
  useEffect(() => {
    if (!endAnchorIso) return;
    if (!/^\d{1,2}:\d{2}$/.test(startTimeField)) return;
    const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
    const endMs = new Date(endAnchorIso).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return;
    const mins = Math.max(1, Math.round((endMs - startMs) / 60_000));
    setDuration(mins.toString());
  }, [startTimeField, date, endAnchorIso]);


  const markTouched = (key: string) =>
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

  const updateExercise = (index: number, updater: (ex: ParsedExercise) => ParsedExercise) => {
    setParsed((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i === index ? updater(ex) : ex)),
    }));
  };

  const updateSet = (
    index: number,
    n: SetN | 'warmup',
    field: 'reps' | 'weight',
    value: string
  ) => {
    const repKey = (n === 'warmup' ? 'warmup' : `set${n}`) as SetField;
    const wKey = (n === 'warmup' ? 'warmupWeight' : `set${n}Weight`) as WeightField;
    const tKey = (n === 'warmup' ? 'warmupTime' : `set${n}Time`) as TimeField;
    const touchKey = `${index}-${field === 'reps' ? repKey : wKey}`;
    markTouched(touchKey);

    updateExercise(index, (ex) => {
      const newSets = { ...ex.sets };
      const newTs = { ...ex.timestamps };
      if (field === 'reps') {
        const sanitized = sanitizeDecimal(value);
        newSets[repKey] = sanitized;
        if (sanitized && !newTs[tKey]) {
          newTs[tKey] = nowHHMM();
        }
        if (!sanitized) {
          delete newTs[tKey];
        }
      } else {
        newSets[wKey] = sanitizeDecimal(value);
      }
      return { ...ex, sets: newSets, timestamps: newTs };
    });
  };

  const addSetRow = (index: number) => {
    updateExercise(index, (ex) => ({
      ...ex,
      visibleSets: Math.min(6, ex.visibleSets + 1),
    }));
  };

  const updateNote = (index: number, value: string) => {
    updateExercise(index, (ex) => ({ ...ex, note: value }));
  };

  const removeExercise = (index: number) => {
    setParsed((prev) => ({
      ...prev,
      exercises: prev.exercises
        .filter((_, i) => i !== index)
        .map((ex, i) => ({ ...ex, seq: i + 1 })),
    }));
    setExpanded(null);
  };

  const addExercise = () => {
    const name = newExerciseName.trim();
    if (!name) return;
    setParsed((prev) => {
      const next = [
        ...prev.exercises,
        {
          seq: prev.exercises.length + 1,
          name,
          sets: {} as ExerciseSets,
          timestamps: {} as ExerciseTimestamps,
          note: '',
          visibleSets: 3,
        },
      ];
      return { ...prev, exercises: next };
    });
    setExpanded(parsed.exercises.length);
    setNewExerciseName('');
    setShowAddExercise(false);
  };

  const isComplete = (ex: ParsedExercise) =>
    Boolean(
      ex.sets.warmup ||
        ex.sets.set1 ||
        ex.sets.set2 ||
        ex.sets.set3 ||
        ex.sets.set4 ||
        ex.sets.set5 ||
        ex.sets.set6
    );

  // Computed span derived from notes (for the caption + Recalculate button).
  const lastSetHHMM = getLastSetHHMM(parsed);
  const computedSpanMin = (() => {
    if (!lastSetHHMM || !/^\d{1,2}:\d{2}$/.test(startTimeField)) return null;
    const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
    const anchor = buildAnchorIso(date, lastSetHHMM, startTimeField);
    if (!anchor || Number.isNaN(startMs)) return null;
    const endMs = new Date(anchor).getTime();
    if (endMs <= startMs) return null;
    return Math.max(1, Math.round((endMs - startMs) / 60_000));
  })();

  const handleRecalculate = () => {
    if (computedSpanMin != null) setDuration(String(computedSpanMin));
  };

  const handleSave = async () => {
    if (!session || savingRef.current) return;
    const updatedNotes = formatSessionNotes({
      ...parsed,
      startTime: parsed.startTime || startTimeField || '',
    });

    // Always recalc duration from the end-time anchor when both anchor and
    // start time are valid — this silently corrects stale `duration` values
    // on the next save without requiring the user to touch the start field.
    let finalDuration = parseInt(duration) || 0;
    let finalEndIso: string | undefined = endAnchorIso || undefined;
    if (endAnchorIso && /^\d{1,2}:\d{2}$/.test(startTimeField)) {
      const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
      const endMs = new Date(endAnchorIso).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
        finalDuration = Math.max(1, Math.round((endMs - startMs) / 60_000));
      }
    } else if (/^\d{1,2}:\d{2}$/.test(startTimeField) && finalDuration > 0) {
      // No anchor — synthesize one from the manual duration so future edits work.
      const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
      if (!Number.isNaN(startMs)) {
        finalEndIso = new Date(startMs + finalDuration * 60_000).toISOString();
      }
    }

    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    let saved = false;
    try {
      saved = await confirmedSuccess(
        () => onSave(session.id, {
          exercise: exerciseName,
          duration: finalDuration,
          date,
          start_time: startTimeField || undefined,
          end_time: finalEndIso,
          notes: updatedNotes || undefined,
        }),
        { requireTrue: true },
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // Close only after the change was confirmed. On failure everything typed stays and the error is shown.
    if (saved) onClose();
    else setSaveFailed(true);
  };


  if (!session) return null;

  // Enter moves to the next field of the same exercise, then closes the keyboard after the last.
  const advance = (index: number, visibleSets: number, key: AnyExerciseKey, input: HTMLInputElement) => {
    const next = nextInOrder(fieldOrder(visibleSets), key);
    if (!next) {
      input.blur();
      return;
    }
    document.getElementById(fieldInputId('ew', index, next))?.focus();
  };

  const renderSetRow = (ex: ParsedExercise, index: number, n: SetN | 'warmup') => {
    const repKey = (n === 'warmup' ? 'warmup' : `set${n}`) as SetField;
    const wKey = (n === 'warmup' ? 'warmupWeight' : `set${n}Weight`) as WeightField;
    const tKey = (n === 'warmup' ? 'warmupTime' : `set${n}Time`) as TimeField;
    const reps = ex.sets[repKey] || '';
    const weight = ex.sets[wKey] || '';
    const order = fieldOrder(ex.visibleSets);
    const hint = (k: AnyExerciseKey) => (nextInOrder(order, k) ? 'next' : 'done') as 'next' | 'done';
    return (
      <WorkoutSetRow
        key={repKey}
        idBase={`ew-${index}-${repKey}`}
        exerciseName={ex.name || `Exercise ${index + 1}`}
        setLabel={n === 'warmup' ? 'Warm-up' : `Set ${n}`}
        shortLabel={n === 'warmup' ? 'Warm' : String(n)}
        reps={reps}
        weight={weight}
        decimalReps
        repsMaxLength={6}
        repsHighlight={!!touched[`${index}-${repKey}`] && !!reps}
        weightHighlight={!!touched[`${index}-${wKey}`] && !!weight}
        loggedAt={ex.timestamps[tKey]}
        enterHints={{ reps: hint(repKey), weight: hint(wKey) }}
        onRepsChange={(v) => updateSet(index, n, 'reps', v)}
        onWeightChange={(v) => updateSet(index, n, 'weight', v)}
        onEnter={(field, input) => advance(index, ex.visibleSets, field === 'reps' ? repKey : wKey, input)}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        layout="mobile-full"
        closeLabel="Close workout editor"
        className="flex flex-col gap-0 p-0 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:pt-[max(0.5rem,env(safe-area-inset-top))] sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b px-3 pb-3 pt-1 text-left sm:px-4 sm:pt-4">
          <DialogTitle className="flex min-h-11 items-center pr-12 sm:min-h-0 sm:pr-8">Edit Workout</DialogTitle>
          <DialogDescription className="sr-only">
            Change the workout name, times, and the reps and weight of each set. Nothing is saved until you press Save Changes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          {/* Top-level fields */}
          <div className="space-y-2">
            <Label htmlFor="ew-name">Workout name</Label>
            <Input id="ew-name" className="h-11" enterKeyHint="next" value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
            <div className="space-y-2 min-[400px]:col-span-2 md:col-span-1">
              <Label htmlFor="ew-duration">Duration (min)</Label>
              <Input
                id="ew-duration"
                className="h-11"
                inputMode="numeric"
                enterKeyHint="next"
                aria-describedby={computedSpanMin != null ? 'ew-duration-hint' : undefined}
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
              />
              {computedSpanMin != null && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span id="ew-duration-hint">
                    Sets span: {startTimeField} → {lastSetHHMM} ({computedSpanMin} min)
                  </span>
                  {parseInt(duration) !== computedSpanMin && (
                    <Button type="button" variant="outline" size="touch" className="px-3 text-xs" onClick={handleRecalculate}>
                      Recalculate
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ew-date">Date</Label>
              <Input id="ew-date" className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ew-start">Start time</Label>
              <Input
                id="ew-start"
                className="h-11"
                type="time"
                value={startTimeField}
                onChange={(e) => {
                  setStartTimeField(e.target.value);
                  setParsed((prev) => ({ ...prev, startTime: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ew-end">End time</Label>
              <Input
                id="ew-end"
                className="h-11"
                type="time"
                value={parsed.endTime}
                onChange={(e) => setParsed((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* Exercises */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-medium leading-none">Exercises</h3>
              <Button
                type="button"
                variant="outline"
                size="touch"
                aria-expanded={showAddExercise}
                onClick={() => setShowAddExercise((s) => !s)}
              >
                <Plus aria-hidden="true" /> Add exercise
              </Button>
            </div>

            {showAddExercise && (
              <div className="flex gap-2">
                <Input
                  aria-label="New exercise name"
                  className="h-11 min-w-0 flex-1"
                  placeholder="Exercise name"
                  enterKeyHint="done"
                  autoFocus
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExercise();
                    }
                  }}
                />
                <Button type="button" size="touch" onClick={addExercise} disabled={!newExerciseName.trim()}>
                  Add
                </Button>
              </div>
            )}

            {parsed.exercises.length === 0 && !showAddExercise && (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No structured exercises. Add one to start editing.
              </p>
            )}

            {parsed.exercises.map((ex, index) => {
              const openEx = expanded === index;
              const complete = isComplete(ex);
              const visibleNums = SET_NUMS.slice(0, ex.visibleSets);
              const exName = ex.name || `Exercise ${index + 1}`;
              return (
                <Collapsible
                  key={index}
                  open={openEx}
                  onOpenChange={(o) => setExpanded(o ? index : null)}
                >
                  <div className="rounded-lg border">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-h-12 w-full justify-between gap-2 whitespace-normal rounded-lg p-3 text-left text-base font-normal focus-visible:ring-inset focus-visible:ring-offset-0"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn('h-2 w-2 shrink-0 rounded-full', complete ? 'bg-primary' : 'bg-muted-foreground/40')}
                          />
                          <span className="sr-only">{complete ? 'Has logged sets.' : 'No sets logged.'}</span>
                          <span className="min-w-0 break-words font-medium">
                            {(ex.seq ?? index + 1)}. {ex.name}
                          </span>
                        </span>
                        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', openEx && 'rotate-180')} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 p-3 pt-0">
                      <div className="space-y-2">
                        <Label htmlFor={`ew-name-${index}`} className="text-xs">Exercise name</Label>
                        <Input
                          id={`ew-name-${index}`}
                          className="h-11"
                          value={ex.name}
                          onChange={(e) =>
                            updateExercise(index, (curr) => ({ ...curr, name: e.target.value }))
                          }
                        />
                      </div>

                      <div role="group" aria-label={`${exName} sets`} className="space-y-2">
                        <SetColumnHeader withUse={false} />
                        {renderSetRow(ex, index, 'warmup')}
                        {visibleNums.map((n) => renderSetRow(ex, index, n))}
                      </div>

                      {ex.visibleSets < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="touch"
                          className="w-full border-dashed"
                          aria-label={`Add set (${ex.visibleSets + 1} of 6) for ${exName}`}
                          onClick={() => addSetRow(index)}
                        >
                          <Plus aria-hidden="true" />
                          Add set ({ex.visibleSets + 1} of 6)
                        </Button>
                      )}

                      {/* Note */}
                      <div className="space-y-2">
                        <Label htmlFor={`ew-note-${index}`} className="flex items-center gap-1 text-xs">
                          <StickyNote className="h-3 w-3" aria-hidden="true" /> Note<span className="sr-only"> for {exName}</span>
                        </Label>
                        <Textarea
                          id={`ew-note-${index}`}
                          rows={2}
                          className="text-base md:text-sm"
                          placeholder="Notes for this exercise"
                          value={ex.note}
                          onChange={(e) => updateNote(index, e.target.value)}
                        />
                      </div>

                      <div className="flex justify-end">
                        <ConfirmDeleteButton
                          type="button"
                          variant="ghost"
                          size="touch"
                          aria-label={`Remove ${exName}`}
                          onConfirm={() => removeExercise(index)} confirmationTitle="Remove exercise?" confirmationDescription={`Remove “${ex.name}” and all its sets, weights, timestamps and comments from this workout? This change takes effect when you save.`} confirmLabel="Yes, remove"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                          Remove
                        </ConfirmDeleteButton>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </div>

        {saveFailed && (
          <p role="alert" className="shrink-0 border-t border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:px-4">
            {SAVE_FAILED_MESSAGE}
          </p>
        )}

        <DialogFooter className="grid shrink-0 grid-cols-2 gap-2 border-t px-3 pt-2 sm:flex sm:space-x-0 sm:px-4 sm:py-3">
          <Button variant="outline" size="touch" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="touch" onClick={handleSave} loading={saving} loadingText="Saving…">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
