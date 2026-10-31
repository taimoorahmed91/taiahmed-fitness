import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

interface HistoryPagerProps {
  page: number;
  totalPages: number;
  /** What a page is made of, for the summary: "days", "weeks", "meals". */
  unit: string;
  range: { from: number; to: number; total: number };
  onPageChange: (page: number) => void;
  className?: string;
}

/** Previous / next with an honest summary such as "Days 8–14 of 23". Hidden when there is only one page. */
export const HistoryPager = ({ page, totalPages, unit, range, onPageChange, className }: HistoryPagerProps) => {
  if (totalPages <= 1) return null;
  const heading = unit.charAt(0).toUpperCase() + unit.slice(1);
  return (
    <nav aria-label="Pagination" className={className ?? 'flex flex-col items-center gap-2 px-3 pt-4 sm:flex-row sm:justify-between sm:px-4'}>
      <p className="text-sm text-muted-foreground">
        {heading} {range.from}–{range.to} of {range.total}
      </p>
      {/* Announces page changes to screen readers without moving focus. */}
      <span role="status" className="sr-only">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" variant="outline" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft />
        </IconButton>
        <span aria-hidden="true" className="min-w-24 px-2 text-center text-sm tabular-nums text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <IconButton label="Next page" variant="outline" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <ChevronRight />
        </IconButton>
      </div>
    </nav>
  );
};
