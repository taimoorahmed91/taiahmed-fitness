import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRange } from '@/hooks/useDataFilter';

interface DataFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  timeFilter: string;
  onTimeFilterChange: (filter: string) => void;
  searchPlaceholder?: string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  showDateRange?: boolean;
}

interface DateFieldProps {
  label: 'From' | 'To';
  value?: Date;
  onSelect: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
}

/** One end of the custom range: a small visible label on top, and a date button whose accessible name always starts with it. */
const DateField = ({ label, value, onSelect, disabled }: DateFieldProps) => {
  const shown = value ? format(value, 'dd/MM/yyyy') : 'Pick a date';
  return (
    <div className="min-w-0 space-y-1 sm:w-44">
      <span aria-hidden="true" className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={`${label} date: ${value ? shown : 'not set'}`}
            className={cn('w-full min-w-0 justify-start text-left font-normal', !value && 'text-muted-foreground')}
          >
            <CalendarIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{shown}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onSelect}
            disabled={disabled}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const DataFilter = ({
  searchQuery,
  onSearchChange,
  timeFilter,
  onTimeFilterChange,
  searchPlaceholder = 'Search...',
  dateRange,
  onDateRangeChange,
  showDateRange = false,
}: DataFilterProps) => {
  const hasCustomRange = dateRange?.from && dateRange?.to;

  const clearDateRange = () => {
    onDateRangeChange?.({ from: undefined, to: undefined });
    onTimeFilterChange('all');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            maxLength={100}
            aria-label={searchPlaceholder}
          />
        </div>
        <Select value={timeFilter} onValueChange={onTimeFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px] bg-card" aria-label="Filter by time">
            <SelectValue placeholder="Filter by time" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            {showDateRange && <SelectItem value="custom">Custom Range</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {showDateRange && (timeFilter === 'custom' || hasCustomRange) && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <DateField
            label="From"
            value={dateRange?.from}
            onSelect={(date) => onDateRangeChange?.({ from: date, to: dateRange?.to })}
          />
          <DateField
            label="To"
            value={dateRange?.to}
            onSelect={(date) => onDateRangeChange?.({ from: dateRange?.from, to: date })}
            disabled={(date) => (dateRange?.from ? date < dateRange.from : false)}
          />
          {hasCustomRange && (
            // A labelled button on phones (it would float alone on its own row as a bare icon); icon only from sm up.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear date range"
              title="Clear date range"
              onClick={clearDateRange}
              className="col-span-2 justify-self-start px-2 text-muted-foreground sm:col-span-1 sm:w-10 sm:justify-self-auto sm:px-0 [@media(pointer:coarse)]:sm:w-11"
            >
              <X aria-hidden="true" />
              <span className="sm:sr-only">Clear dates</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
