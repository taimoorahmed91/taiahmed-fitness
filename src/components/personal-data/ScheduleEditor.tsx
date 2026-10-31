import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WEEKDAYS } from './model';

export interface ScheduleEditorProps {
  workoutDays: number[];
  dayTemplates: Record<string, string>;
  templates: { id: string; name: string }[];
  onToggleDay: (day: number, on: boolean) => void;
  /** `null` clears the template for that day. */
  onTemplate: (day: number, templateId: string | null) => void;
}

/**
 * Seven weekday rows, Monday first. Each is a checkbox with its day name; a day that is on shows a template picker,
 * a day that is off says "Rest day" in words. Wide screens put checkbox, day and picker on one line;
 * phones put the picker under the day so it can use the full width. Every row is at least 44px tall.
 */
export const ScheduleEditor = ({ workoutDays, dayTemplates, templates, onToggleDay, onTemplate }: ScheduleEditorProps) => (
  <ul className="space-y-1">
    {WEEKDAYS.map((d) => {
      const on = workoutDays.includes(d.v);
      return (
        <li
          key={d.v}
          className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[auto_7rem_minmax(0,18rem)]"
        >
          <Checkbox
            id={`wd-${d.v}`}
            checked={on}
            onCheckedChange={(checked) => onToggleDay(d.v, checked === true)}
          />
          <Label htmlFor={`wd-${d.v}`} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-between gap-2 text-sm">
            {d.long}
            {!on && <span aria-hidden="true" className="font-normal text-muted-foreground sm:hidden">Rest day</span>}
          </Label>
          {on ? (
            <div className="col-span-2 pb-2 pl-7 sm:col-span-1 sm:p-0">
              <Select
                value={dayTemplates[String(d.v)] || 'none'}
                onValueChange={(val) => onTemplate(d.v, val === 'none' ? null : val)}
              >
                <SelectTrigger aria-label={`Template for ${d.long}`}>
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span className="hidden text-sm text-muted-foreground sm:inline">Rest day</span>
          )}
        </li>
      );
    })}
  </ul>
);
