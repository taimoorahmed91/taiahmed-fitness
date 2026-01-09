import { useState, useMemo } from 'react';
import { startOfDay, startOfWeek, startOfMonth, isAfter, parseISO } from 'date-fns';

type TimeFilter = 'all' | 'today' | 'week' | 'month';

interface UseDataFilterOptions<T> {
  data: T[];
  searchFields: (keyof T)[];
  dateField: keyof T;
}

export const useDataFilter = <T,>({
  data,
  searchFields,
  dateField,
}: UseDataFilterOptions<T>) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = item[field];
          return typeof value === 'string' && value.toLowerCase().includes(query);
        })
      );
    }

    // Apply time filter
    if (timeFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (timeFilter) {
        case 'today':
          startDate = startOfDay(now);
          break;
        case 'week':
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          break;
        case 'month':
          startDate = startOfMonth(now);
          break;
        default:
          startDate = new Date(0);
      }

      result = result.filter((item) => {
        const dateValue = item[dateField];
        if (typeof dateValue === 'string') {
          const itemDate = parseISO(dateValue);
          return isAfter(itemDate, startDate) || itemDate.getTime() === startDate.getTime();
        }
        return true;
      });
    }

    return result;
  }, [data, searchQuery, timeFilter, searchFields, dateField]);

  const handleTimeFilterChange = (filter: string) => {
    setTimeFilter(filter as TimeFilter);
  };

  return {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter: handleTimeFilterChange,
    filteredData,
  };
};
