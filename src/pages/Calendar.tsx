import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Utensils, Dumbbell, Scale, Moon, Ruler, FileText } from 'lucide-react';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { useWaist } from '@/hooks/useWaist';
import { useDailyNotes, DailyNote } from '@/hooks/useDailyNotes';
import { cn } from '@/lib/utils';

type DisplayFilter = 'all' | 'meals' | 'gym' | 'weight' | 'sleep' | 'waist' | 'notes';

interface DayEntry {
  type: 'meal' | 'gym' | 'weight' | 'sleep' | 'waist' | 'note';
  data: any;
}

const Calendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [displayFilter, setDisplayFilter] = useState<DisplayFilter>('all');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: weightEntries } = useWeight();
  const { entries: sleepEntries } = useSleep();
  const { entries: waistEntries } = useWaist();
  const { notes } = useDailyNotes();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get the first day of the month to know where to start in the grid
  const startDayOfWeek = monthStart.getDay();
  const paddingDays = Array(startDayOfWeek).fill(null);

  // Combine all entries by date
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();

    if (displayFilter === 'all' || displayFilter === 'meals') {
      meals.forEach((meal) => {
        const dateKey = meal.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'meal', data: meal });
        map.set(dateKey, existing);
      });
    }

    if (displayFilter === 'all' || displayFilter === 'gym') {
      sessions.forEach((session) => {
        const dateKey = session.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'gym', data: session });
        map.set(dateKey, existing);
      });
    }

    if (displayFilter === 'all' || displayFilter === 'weight') {
      weightEntries.forEach((entry) => {
        const dateKey = entry.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'weight', data: entry });
        map.set(dateKey, existing);
      });
    }

    if (displayFilter === 'all' || displayFilter === 'sleep') {
      sleepEntries.forEach((entry) => {
        const dateKey = entry.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'sleep', data: entry });
        map.set(dateKey, existing);
      });
    }

    if (displayFilter === 'all' || displayFilter === 'waist') {
      waistEntries.forEach((entry) => {
        const dateKey = entry.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'waist', data: entry });
        map.set(dateKey, existing);
      });
    }

    if (displayFilter === 'all' || displayFilter === 'notes') {
      notes.forEach((note) => {
        const dateKey = note.date;
        const existing = map.get(dateKey) || [];
        existing.push({ type: 'note', data: note });
        map.set(dateKey, existing);
      });
    }

    return map;
  }, [meals, sessions, weightEntries, sleepEntries, waistEntries, notes, displayFilter]);

  const getEntriesForDate = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return entriesByDate.get(dateKey) || [];
  };

  const getEntryIcon = (type: string) => {
    switch (type) {
      case 'meal':
        return <Utensils className="h-3 w-3 text-orange-500" />;
      case 'gym':
        return <Dumbbell className="h-3 w-3 text-blue-500" />;
      case 'weight':
        return <Scale className="h-3 w-3 text-green-500" />;
      case 'sleep':
        return <Moon className="h-3 w-3 text-purple-500" />;
      case 'waist':
        return <Ruler className="h-3 w-3 text-teal-500" />;
      case 'note':
        return <FileText className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const selectedDateEntries = selectedDate ? getEntriesForDate(selectedDate) : [];

  const renderEntryDetails = (entry: DayEntry) => {
    switch (entry.type) {
      case 'meal':
        return (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Utensils className="h-4 w-4 text-orange-500" />
            <div className="flex-1">
              <p className="font-medium text-sm">{entry.data.food}</p>
              <p className="text-xs text-muted-foreground">{entry.data.calories} cal at {entry.data.time}</p>
            </div>
          </div>
        );
      case 'gym':
        return (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Dumbbell className="h-4 w-4 text-blue-500" />
            <div className="flex-1">
              <p className="font-medium text-sm">{entry.data.exercise}</p>
              <p className="text-xs text-muted-foreground">{entry.data.duration} minutes</p>
            </div>
          </div>
        );
      case 'weight':
        return (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Scale className="h-4 w-4 text-green-500" />
            <div className="flex-1">
              <p className="font-medium text-sm">{entry.data.weight} kg</p>
              {entry.data.notes && <p className="text-xs text-muted-foreground">{entry.data.notes}</p>}
            </div>
          </div>
        );
      case 'sleep':
        return (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Moon className="h-4 w-4 text-purple-500" />
            <div className="flex-1">
              <p className="font-medium text-sm">{entry.data.hours} hours</p>
              {entry.data.notes && <p className="text-xs text-muted-foreground">{entry.data.notes}</p>}
            </div>
          </div>
        );
      case 'waist':
        return (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Ruler className="h-4 w-4 text-teal-500" />
            <div className="flex-1">
              <p className="font-medium text-sm">{entry.data.waist} cm</p>
              {entry.data.notes && <p className="text-xs text-muted-foreground">{entry.data.notes}</p>}
            </div>
          </div>
        );
      case 'note':
        const note = entry.data as DailyNote;
        return (
          <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
            <FileText className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap gap-1 mb-1">
                {note.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
              {note.severity && (
                <p className="text-xs text-muted-foreground">Severity: {note.severity}/5</p>
              )}
              {note.notes && <p className="text-xs text-muted-foreground">{note.notes}</p>}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <CalendarIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Calendar View</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar Grid */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={displayFilter} onValueChange={(v: DisplayFilter) => setDisplayFilter(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entries</SelectItem>
                  <SelectItem value="meals">Meals Only</SelectItem>
                  <SelectItem value="gym">Gym Only</SelectItem>
                  <SelectItem value="weight">Weight Only</SelectItem>
                  <SelectItem value="sleep">Sleep Only</SelectItem>
                  <SelectItem value="waist">Waist Only</SelectItem>
                  <SelectItem value="notes">Notes Only</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {paddingDays.map((_, i) => (
                  <div key={`padding-${i}`} className="aspect-square" />
                ))}
                {daysInMonth.map((day) => {
                  const entries = getEntriesForDate(day);
                  const isToday = isSameDay(day, new Date());
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const uniqueTypes = [...new Set(entries.map((e) => e.type))];
                  const hasNote = uniqueTypes.includes('note');

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        'aspect-square p-1 rounded-lg border transition-colors flex flex-col items-center justify-start gap-1',
                        isToday && 'border-primary',
                        isSelected && 'bg-primary/10 border-primary',
                        hasNote && 'bg-destructive/5',
                        !isToday && !isSelected && 'border-transparent hover:bg-muted/50'
                      )}
                    >
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isToday && 'text-primary',
                          !isSameMonth(day, currentMonth) && 'text-muted-foreground'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      {uniqueTypes.length > 0 && (
                        <div className="flex gap-0.5 flex-wrap justify-center">
                          {uniqueTypes.slice(0, 4).map((type) => (
                            <span key={type}>{getEntryIcon(type)}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDate ? format(selectedDate, 'EEEE, MMM d, yyyy') : 'Select a Date'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="text-muted-foreground text-sm">Click on a date to see entries</p>
              ) : selectedDateEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm">No entries for this date</p>
              ) : (
                <div className="space-y-2">
                  {selectedDateEntries.map((entry, idx) => (
                    <div key={idx}>{renderEntryDetails(entry)}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Calendar;
