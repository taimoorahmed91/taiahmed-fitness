import { useState } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SYMPTOM_TAGS } from '@/hooks/useDailyNotes';
import type { DateRange } from 'react-day-picker';

interface DailyNoteFormProps {
  onSubmit: (note: { date: string; tags: string[]; severity?: number | null; notes?: string }) => void;
}

export const DailyNoteForm = ({ onSubmit }: DailyNoteFormProps) => {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState<Date>(new Date());
  const [range, setRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

    dates.forEach((d) => {
      onSubmit({
        date: format(d, 'yyyy-MM-dd'),
        tags: selectedTags,
        severity,
        notes: notes.trim() || undefined,
      });
    });

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
          <Plus className="h-5 w-5 text-primary" />
          Add Daily Note
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'single' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('single')}
            >
              Single Date
            </Button>
            <Button
              type="button"
              variant={mode === 'range' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('range')}
            >
              Date Range
            </Button>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label>{mode === 'single' ? 'Date' : 'Date Range'}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {mode === 'single' ? (
                    date ? format(date, 'PPP') : <span>Pick a date</span>
                  ) : (
                    <span>{rangeLabel}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
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
                    numberOfMonths={2}
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
          <div className="space-y-2">
            <Label>Symptoms / Tags</Label>
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label>Severity (optional)</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={severity === level ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSeverity(severity === level ? null : level)}
                >
                  {level}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">1 = Mild, 5 = Severe</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Additional Notes (optional)</Label>
            <Textarea
              placeholder="Any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={10000}
              rows={5}
            />
          </div>

          <Button type="submit" className="w-full" disabled={selectedTags.length === 0 && !notes.trim()}>
            Save Note
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
