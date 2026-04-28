import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Plus, StickyNote, Trash2 } from 'lucide-react';
import { GymSession } from '@/types';

interface ExerciseSets {
  set1: string;
  set2: string;
  set3: string;
  set1Weight?: string;
  set2Weight?: string;
  set3Weight?: string;
}

interface ExerciseTimestamps {
  set1Time?: string;
  set2Time?: string;
  set3Time?: string;
}

interface ParsedExercise {
  seq?: number;
  name: string;
  sets: ExerciseSets;
  timestamps: ExerciseTimestamps;
  note: string;
}

interface ParsedSession {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  exercises: ParsedExercise[];
}

const parseSessionNotes = (notes: string | undefined): ParsedSession => {
  const result: ParsedSession = { startTime: '', endTime: '', exercises: [] };
  if (!notes) return result;

  const parts = notes.split(' | ').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    // meta: Start:HH:mm End:HH:mm
    if (/^Start:/i.test(part) && !part.includes(': S')) {
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

    const sets: ExerciseSets = { set1: '', set2: '', set3: '' };
    const timestamps: ExerciseTimestamps = {};

    // S<n>:<reps>[@<weight>kg][@<HH:mm>]
    const setRegex = /S(\d):(\d+(?:\.\d+)?)(?:@(\d+(?:\.\d+)?)kg)?(?:@(\d{1,2}:\d{2}))?/g;
    let m: RegExpExecArray | null;
    while ((m = setRegex.exec(setsText)) !== null) {
      const [, n, reps, weight, time] = m;
      const repKey = `set${n}` as 'set1' | 'set2' | 'set3';
      const wKey = `set${n}Weight` as 'set1Weight' | 'set2Weight' | 'set3Weight';
      const tKey = `set${n}Time` as 'set1Time' | 'set2Time' | 'set3Time';
      sets[repKey] = reps;
      if (weight) sets[wKey] = weight;
      if (time) timestamps[tKey] = time;
    }

    result.exercises.push({ seq, name: header, sets, timestamps, note: noteText });
  }

  // sort by seq if present
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
    const buildSet = (n: 1 | 2 | 3) => {
      const reps = ex.sets[`set${n}` as 'set1'].toString().trim();
      if (!reps) return null;
      const weight = (ex.sets[`set${n}Weight` as 'set1Weight'] || '').toString().trim();
      const time = (ex.timestamps[`set${n}Time` as 'set1Time'] || '').trim();
      return `S${n}:${reps}${weight ? `@${weight}kg` : ''}${time ? `@${time}` : ''}`;
    };
    const setsText = [buildSet(1), buildSet(2), buildSet(3)].filter(Boolean).join(' ');
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

interface EditWorkoutSessionModalProps {
  session: GymSession | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Omit<GymSession, 'id'>>) => Promise<void> | void;
}

export const EditWorkoutSessionModal = ({ session, open, onClose, onSave }: EditWorkoutSessionModalProps) => {
  const [exerciseName, setExerciseName] = useState('');
  const [duration, setDuration] = useState('');
  const [date, setDate] = useState('');
  const [startTimeField, setStartTimeField] = useState('');
  const [parsed, setParsed] = useState<ParsedSession>({ startTime: '', endTime: '', exercises: [] });
  const [expanded, setExpanded] = useState<number | null>(0);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);

  useEffect(() => {
    if (session && open) {
      setExerciseName(session.exercise);
      setDuration(session.duration.toString());
      setDate(session.date);
      setStartTimeField(session.start_time || '');
      const p = parseSessionNotes(session.notes);
      // Default start meta to session.start_time if not already in notes
      if (!p.startTime && session.start_time) p.startTime = session.start_time;
      setParsed(p);
      setExpanded(p.exercises.length > 0 ? 0 : null);
      setShowAddExercise(false);
      setNewExerciseName('');
    }
  }, [session, open]);

  const updateExercise = (index: number, updater: (ex: ParsedExercise) => ParsedExercise) => {
    setParsed((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => (i === index ? updater(ex) : ex)),
    }));
  };

  const updateSet = (index: number, n: 1 | 2 | 3, field: 'reps' | 'weight', value: string) => {
    updateExercise(index, (ex) => {
      const newSets = { ...ex.sets };
      const newTs = { ...ex.timestamps };
      const repKey = `set${n}` as 'set1' | 'set2' | 'set3';
      const wKey = `set${n}Weight` as 'set1Weight' | 'set2Weight' | 'set3Weight';
      const tKey = `set${n}Time` as 'set1Time' | 'set2Time' | 'set3Time';
      if (field === 'reps') {
        const sanitized = sanitizeDecimal(value);
        newSets[repKey] = sanitized;
        if (sanitized && !newTs[tKey]) {
          const now = new Date();
          newTs[tKey] = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
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
          sets: { set1: '', set2: '', set3: '' } as ExerciseSets,
          timestamps: {} as ExerciseTimestamps,
          note: '',
        },
      ];
      return { ...prev, exercises: next };
    });
    setExpanded(parsed.exercises.length);
    setNewExerciseName('');
    setShowAddExercise(false);
  };

  const isComplete = (ex: ParsedExercise) =>
    Boolean(ex.sets.set1 || ex.sets.set2 || ex.sets.set3);

  const handleSave = async () => {
    if (!session) return;
    const updatedNotes = formatSessionNotes({
      ...parsed,
      startTime: parsed.startTime || startTimeField || '',
    });
    await onSave(session.id, {
      exercise: exerciseName,
      duration: parseInt(duration) || 0,
      date,
      start_time: startTimeField || undefined,
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
              const open = expanded === index;
              const complete = isComplete(ex);
              return (
                <Collapsible
                  key={index}
                  open={open}
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
                        {open ? (
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

                      {/* Reps row */}
                      <div className="space-y-1">
                        <Label className="text-xs">Reps</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((n) => {
                            const repKey = `set${n}` as 'set1' | 'set2' | 'set3';
                            const tKey = `set${n}Time` as 'set1Time' | 'set2Time' | 'set3Time';
                            return (
                              <div key={`reps-${n}`} className="space-y-0.5">
                                <Input
                                  inputMode="decimal"
                                  placeholder={`Set ${n}`}
                                  value={ex.sets[repKey] || ''}
                                  onChange={(e) =>
                                    updateSet(index, n as 1 | 2 | 3, 'reps', e.target.value)
                                  }
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
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((n) => {
                            const wKey = `set${n}Weight` as 'set1Weight' | 'set2Weight' | 'set3Weight';
                            return (
                              <Input
                                key={`w-${n}`}
                                inputMode="decimal"
                                placeholder={`Set ${n}`}
                                value={ex.sets[wKey] || ''}
                                onChange={(e) =>
                                  updateSet(index, n as 1 | 2 | 3, 'weight', e.target.value)
                                }
                              />
                            );
                          })}
                        </div>
                      </div>

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
