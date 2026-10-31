import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const PaginationControls = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  hasNextPage,
  hasPrevPage,
}: PaginationControlsProps) => {
  if (totalPages <= 1) return null;

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {totalItems} item{totalItems !== 1 ? 's' : ''}
      </p>
      {/* Announces page changes to screen readers without moving focus. */}
      <span role="status" className="sr-only">
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          label="Previous page"
          variant="outline"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrevPage}
        >
          <ChevronLeft />
        </IconButton>
        {/* Phones: a short "Page 2 of 5" instead of up to 7 page buttons that would not fit. */}
        <span aria-hidden="true" className="min-w-24 px-2 text-center text-sm tabular-nums text-muted-foreground sm:hidden">
          Page {currentPage} of {totalPages}
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          {getPageNumbers().map((page, i) =>
            page === 'ellipsis' ? (
              <span key={`e-${i}`} aria-hidden="true" className="px-2 text-sm text-muted-foreground">…</span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? 'default' : 'outline'}
                size="icon"
                className="text-sm tabular-nums"
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => onPageChange(page)}
              >
                {page}
              </Button>
            )
          )}
        </div>
        <IconButton
          label="Next page"
          variant="outline"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage}
        >
          <ChevronRight />
        </IconButton>
      </div>
    </nav>
  );
};
