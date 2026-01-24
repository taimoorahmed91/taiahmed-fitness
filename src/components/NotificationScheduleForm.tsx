import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Clock } from 'lucide-react';

interface NotificationScheduleFormProps {
  initialSchedule: string | null;
  onSave: (schedule: string) => Promise<void>;
  saving: boolean;
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: i.toString().padStart(2, '0') + ':00',
}));

const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  value: i.toString(),
  label: i.toString().padStart(2, '0'),
}));

const FREQUENCIES = [
  { value: '1', label: 'Every hour' },
  { value: '2', label: 'Every 2 hours' },
  { value: '3', label: 'Every 3 hours' },
  { value: '4', label: 'Every 4 hours' },
  { value: '6', label: 'Every 6 hours' },
  { value: '12', label: 'Every 12 hours' },
];

export const NotificationScheduleForm = ({ initialSchedule, onSave, saving }: NotificationScheduleFormProps) => {
  const [minute, setMinute] = useState('30');
  const [startHour, setStartHour] = useState('9');
  const [endHour, setEndHour] = useState('21');
  const [frequency, setFrequency] = useState('3');
  const [selectedDays, setSelectedDays] = useState<string[]>(['1', '2', '3', '4', '5', '6', '0']);

  // Parse initial schedule if provided
  useEffect(() => {
    if (initialSchedule) {
      try {
        const parts = initialSchedule.split(' ');
        if (parts.length === 5) {
          // Parse minute
          setMinute(parts[0]);

          // Parse hour range (e.g., "9-21/3")
          const hourPart = parts[1];
          if (hourPart.includes('-') && hourPart.includes('/')) {
            const [range, freq] = hourPart.split('/');
            const [start, end] = range.split('-');
            setStartHour(start);
            setEndHour(end);
            setFrequency(freq);
          } else if (hourPart.includes('/')) {
            const [range, freq] = hourPart.split('/');
            setFrequency(freq);
            if (range === '*') {
              setStartHour('0');
              setEndHour('23');
            }
          } else if (hourPart !== '*') {
            setStartHour(hourPart);
            setEndHour(hourPart);
            setFrequency('1');
          }

          // Parse days of week
          const daysPart = parts[4];
          if (daysPart === '*') {
            setSelectedDays(['0', '1', '2', '3', '4', '5', '6']);
          } else {
            const days = daysPart.split(',');
            setSelectedDays(days);
          }
        }
      } catch (e) {
        console.error('Failed to parse cron schedule:', e);
      }
    }
  }, [initialSchedule]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => parseInt(a) - parseInt(b))
    );
  };

  const generateCronExpression = (): string => {
    // Format: minute hour * * days
    const hourRange = startHour === endHour 
      ? startHour 
      : `${startHour}-${endHour}/${frequency}`;
    
    const days = selectedDays.length === 7 ? '*' : selectedDays.join(',');
    
    return `${minute} ${hourRange} * * ${days}`;
  };

  const handleSave = () => {
    const cron = generateCronExpression();
    onSave(cron);
  };

  const cronExpression = generateCronExpression();

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {/* Time Selection */}
        <div className="space-y-2">
          <Label>Notification Minute</Label>
          <Select value={minute} onValueChange={setMinute}>
            <SelectTrigger>
              <SelectValue placeholder="Select minute" />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  :{m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Notifications will be sent at this minute of each hour
          </p>
        </div>

        {/* Hour Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Hour</Label>
            <Select value={startHour} onValueChange={setStartHour}>
              <SelectTrigger>
                <SelectValue placeholder="Start" />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map(h => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>End Hour</Label>
            <Select value={endHour} onValueChange={setEndHour}>
              <SelectTrigger>
                <SelectValue placeholder="End" />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map(h => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger>
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Days of Week */}
        <div className="space-y-2">
          <Label>Days of Week</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map(day => (
              <div key={day.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${day.value}`}
                  checked={selectedDays.includes(day.value)}
                  onCheckedChange={() => toggleDay(day.value)}
                />
                <label
                  htmlFor={`day-${day.value}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {day.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cron Expression Preview</span>
        </div>
        <code className="text-sm font-mono text-primary">{cronExpression}</code>
      </div>

      <Button onClick={handleSave} disabled={saving || selectedDays.length === 0}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving...' : 'Save Schedule'}
      </Button>
    </div>
  );
};
