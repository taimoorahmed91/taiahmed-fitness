import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type SortOrder = 'asc' | 'desc' | null;

interface SortControlProps {
  label: string;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
}

export const SortControl = ({ label, sortOrder, onSortChange }: SortControlProps) => {
  const handleClick = () => {
    if (sortOrder === null) {
      onSortChange('desc');
    } else if (sortOrder === 'desc') {
      onSortChange('asc');
    } else {
      onSortChange(null);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="gap-1 text-muted-foreground hover:text-foreground"
    >
      {label}
      {sortOrder === null && <ArrowUpDown className="h-4 w-4" />}
      {sortOrder === 'desc' && <ArrowDown className="h-4 w-4" />}
      {sortOrder === 'asc' && <ArrowUp className="h-4 w-4" />}
    </Button>
  );
};
