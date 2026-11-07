import { type RefObject } from 'react';
import { Download, FileDown, Loader2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadTextFile } from '@/components/charts/downloadCsv';
import { useChartPdf, type PdfColumn } from '@/components/charts/useChartPdf';
import { buildCsv, canExportCsv, csvFilename } from '@/lib/chartCsv';
import type { ChartViewerDataset } from '@/lib/chartViewerData';

export interface ChartActionsPdf {
  /** The element to capture (usually the Card). */
  targetRef: RefObject<HTMLElement>;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
}

interface ChartActionsMenuProps {
  title: string;
  pdf?: ChartActionsPdf;
  /** The chart's complete rows. Gives the menu a CSV download of exactly what the plot draws. */
  dataset?: ChartViewerDataset;
}

const ITEM_CLASS = 'min-h-10 cursor-pointer gap-2 [&_svg]:size-4 [&_svg]:shrink-0';

/**
 * "More chart actions": the exports (PDF, CSV) behind one quiet icon button, so a chart card keeps only its range,
 * line / bar switch and the pop-out in view. A Radix menu: Enter, Space or Arrow Down opens it, arrows move, Escape closes
 * and puts focus back on the button. The button and the menu are left out of PDF captures.
 */
export const ChartActionsMenu = ({ title, pdf, dataset }: ChartActionsMenuProps) => {
  const { busy, exportPdf } = useChartPdf({
    targetRef: pdf?.targetRef ?? { current: null },
    title,
    subtitle: pdf?.subtitle,
    columns: pdf?.columns ?? [],
    rows: pdf?.rows ?? [],
  });
  const csvOffered = !!dataset;
  if (!pdf && !csvOffered) return null;
  const csvReady = !!dataset && canExportCsv(dataset);

  const exportCsv = () => {
    if (!dataset) return;
    const csv = buildCsv(dataset);
    if (csv == null) return;
    downloadTextFile(csvFilename(dataset), csv);
    const n = dataset.rows.length;
    toast.success(`Downloaded ${n} ${n === 1 ? 'row' : 'rows'} as CSV.`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-chart-menu=""
          data-html2canvas-ignore="true"
          aria-label={`More chart actions for ${title}`}
          aria-busy={busy || undefined}
          className="chart-action h-8 w-8 min-w-0 shrink-0 px-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-html2canvas-ignore="true" className="w-44">
        {pdf && (
          <DropdownMenuItem className={ITEM_CLASS} disabled={busy} onSelect={() => void exportPdf()}>
            <FileDown aria-hidden="true" />
            Download PDF
          </DropdownMenuItem>
        )}
        {csvOffered && (
          <DropdownMenuItem className={ITEM_CLASS} disabled={!csvReady} onSelect={exportCsv}>
            <Download aria-hidden="true" />
            Download CSV
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
