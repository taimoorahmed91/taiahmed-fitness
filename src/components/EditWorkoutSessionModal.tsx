import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Plus, StickyNote, Trash2 } from 'lucide-react';
import { GymSession } from '@/types';

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
    const cleanNote = ex.note.trim().replace(/[\[\]|]/g, '');
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

const greenIf = (hasValue: boolean) =>
  hasValue ? 'border-green-500 focus-visible:ring-green-500' : '';

interface EditWorkoutSessionModalProps {
  session: GymSession | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Omit<GymSession, 'id'>>) => Promise<void> | void;
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

      // Determine end-time anchor: prefer stored end_time, else derive from
      // original start_time + duration so that editing start recalculates duration.
      let anchor: string | null = null;
      if (session.end_time) {
        anchor = session.end_time;
      } else if (session.start_time && session.duration && /^\d{1,2}:\d{2}$/.test(session.start_time)) {
        const startMs = new Date(`${session.date}T${session.start_time}:00`).getTime();
        if (!Number.isNaN(startMs)) {
          anchor = new Date(startMs + session.duration * 60_000).toISOString();
        }
      }
      setEndAnchorIso(anchor);

      const p = parseSessionNotes(session.notes);
      if (!p.startTime && session.start_time) p.startTime = session.start_time;
      setParsed(p);
      setExpanded(p.exercises.length > 0 ? 0 : null);
      setShowAddExercise(false);
      setNewExerciseName('');
      setTouched({});
    }
  }, [session, open]);

  // Live preview: if user changes start time/date and we have an end anchor,
  // recompute the displayed duration so they see the effect before saving.
  useEffect(() => {
    if (!endAnchorIso) return;
    if (!/^\d{1,2}:\d{2}$/.test(startTimeField)) return;
    const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
    const endMs = new Date(endAnchorIso).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;
    const startChanged = startTimeField !== originalStartTime || date !== originalDate;
    if (!startChanged) return;
    const mins = Math.max(1, Math.round((endMs - startMs) / 60_000));
    setDuration(mins.toString());
  }, [startTimeField, date, endAnchorIso, originalStartTime, originalDate]);

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

  const handleSave = async () => {
    if (!session) return;
    const updatedNotes = formatSessionNotes({
      ...parsed,
      startTime: parsed.startTime || startTimeField || '',
    });

    // Recalculate duration from end anchor when start time/date changed.
    let finalDuration = parseInt(duration) || 0;
    let finalEndIso: string | undefined = endAnchorIso || undefined;
    const startChanged = startTimeField !== originalStartTime || date !== originalDate;
    if (endAnchorIso && /^\d{1,2}:\d{2}$/.test(startTimeField)) {
      const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
      const endMs = new Date(endAnchorIso).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
        if (startChanged) {
          finalDuration = Math.max(1, Math.round((endMs - startMs) / 60_000));
        }
      }
    } else if (startChanged && /^\d{1,2}:\d{2}$/.test(startTimeField) && finalDuration > 0) {
      // No prior anchor — establish one from the new start + manual duration.
      const startMs = new Date(`${date}T${startTimeField}:00`).getTime();
      if (!Number.isNaN(startMs)) {
        finalEndIso = new Date(startMs + finalDuration * 60_000).toISOString();
      }
    }

    await onSave(session.id, {
      exercise: exerciseName,
      duration: finalDuration,
      date,
      start_time: startTimeField || undefined,
      end_time: finalEndIso,
      notes: updatedNotes || undefined,
    });
    onClose();
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Workout</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Top-level fields */}
          <div className="space-y-2">
            <Label>Workout name</Label>
            <Input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start time</Label>
              <Input
                type="time"
                value={startTimeField}
                onChange={(e) => {
                  setStartTimeField(e.target.value);
                  setParsed((prev) => ({ ...prev, startTime: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End time</Label>
              <Input
                type="time"
                value={parsed.endTime}
                onChange={(e) => setParsed((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* Exercises */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">Exercises</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddExercise((s) => !s)}
              >
                <Plus className="h-4 w-4 mr-1" /> Add exercise
              </Button>
            </div>

            {showAddExercise && (
              <div className="flex gap-2">
                <Input
                  placeholder="Exercise name"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExercise();
                    }
                  }}
                />
                <Button type="button" onClick={addExercise} disabled={!newExerciseName.trim()}>
                  Add
                </Button>
              </div>
            )}

            {parsed.exercises.length === 0 && !showAddExercise && (
              <p className="text-sm text-muted-foreground py-3 text-center">
                No structured exercises. Add one to start editing.
              </p>
            )}

            {parsed.exercises.map((ex, index) => {
              const openEx = expanded === index;
              const complete = isComplete(ex);
              const visibleNums = SET_NUMS.slice(0, ex.visibleSets);
              return (
                <Collapsible
                  key={index}
                  open={openEx}
                  onOpenChange={(o) => setExpanded(o ? index : null)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              complete ? 'bg-primary' : 'bg-muted-foreground/40'
                            }`}
                          />
                          <span className="font-medium truncate">
                            {(ex.seq ?? index + 1)}. {ex.name}
                          </span>
                        </div>
                        {openEx ? (
                          <ChevronUp className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="p-3 pt-0 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Exercise name</Label>
                        <Input
                          value={ex.name}
                          onChange={(e) =>
                            updateExercise(index, (curr) => ({ ...curr, name: e.target.value }))
                          }
                        />
                      </div>

                      {/* Warmup row */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Warmup</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <Input
                              inputMode="numeric"
                              placeholder="reps"
                              value={ex.sets.warmup || ''}
                              onChange={(e) =>
                                updateSet(index, 'warmup', 'reps', e.target.value)
                              }
                              className={greenIf(!!touched[`${index}-warmup`] && !!ex.sets.warmup)}
                            />
                            {ex.timestamps.warmupTime && (
                              <p className="text-[10px] text-muted-foreground text-center">
                                @ {ex.timestamps.warmupTime}
                              </p>
                            )}
                          </div>
                          <Input
                            inputMode="decimal"
                            placeholder="kg"
                            value={ex.sets.warmupWeight || ''}
                            onChange={(e) =>
                              updateSet(index, 'warmup', 'weight', e.target.value)
                            }
                            className={greenIf(
                              !!touched[`${index}-warmupWeight`] && !!ex.sets.warmupWeight
                            )}
                          />
                        </div>
                      </div>

                      {/* Reps row */}
                      <div className="space-y-1">
                        <Label className="text-xs">Reps</Label>
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${visibleNums.length}, minmax(0, 1fr))` }}
                        >
                          {visibleNums.map((n) => {
                            const repKey = `set${n}` as SetField;
                            const tKey = `set${n}Time` as TimeField;
                            const tk = `${index}-${repKey}`;
                            return (
                              <div key={`reps-${n}`} className="space-y-0.5">
                                <Input
                                  inputMode="decimal"
                                  placeholder={`Set ${n}`}
                                  value={ex.sets[repKey] || ''}
                                  onChange={(e) => updateSet(index, n, 'reps', e.target.value)}
                                  className={greenIf(!!touched[tk] && !!ex.sets[repKey])}
                                />
                                {ex.timestamps[tKey] && (
                                  <p className="text-[10px] text-muted-foreground text-center">
                                    @ {ex.timestamps[tKey]}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Weight row */}
                      <div className="space-y-1">
                        <Label className="text-xs">Weight (kg)</Label>
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${visibleNums.length}, minmax(0, 1fr))` }}
                        >
                          {visibleNums.map((n) => {
                            const wKey = `set${n}Weight` as WeightField;
                            const tk = `${index}-${wKey}`;
                            return (
                              <Input
                                key={`w-${n}`}
                                inputMode="decimal"
                                placeholder={`Set ${n}`}
                                value={ex.sets[wKey] || ''}
                                onChange={(e) => updateSet(index, n, 'weight', e.target.value)}
                                className={greenIf(!!touched[tk] && !!ex.sets[wKey])}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {ex.visibleSets < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full border-dashed h-8 text-xs"
                          onClick={() => addSetRow(index)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add set ({ex.visibleSets + 1} of 6)
                        </Button>
                      )}

                      {/* Note */}
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <StickyNote className="h-3 w-3" /> Note
                        </Label>
                        <Textarea
                          rows={2}
                          placeholder="Notes for this exercise"
                          value={ex.note}
                          onChange={(e) => updateNote(index, e.target.value)}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExercise(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
