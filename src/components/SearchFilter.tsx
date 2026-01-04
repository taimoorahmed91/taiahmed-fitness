import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  timeFilter: string;
  onTimeFilterChange: (filter: string) => void;
}

export const SearchFilter = ({
  searchQuery,
  onSearchChange,
  timeFilter,
  onTimeFilterChange,
}: SearchFilterProps) => {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search meals..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          maxLength={100}
        />
      </div>
      <Select value={timeFilter} onValueChange={onTimeFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px] bg-card">
          <SelectValue placeholder="Filter by time" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
