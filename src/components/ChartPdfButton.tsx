import { type RefObject } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChartPdf, type PdfColumn } from '@/components/charts/useChartPdf';

export type { PdfColumn };
type PdfRow = Record<string, unknown>;

interface ChartPdfButtonProps {
  targetRef: RefObject<HTMLElement>;
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
}

/** The visible PDF button. The full-screen viewer uses it; on the card the same export lives in the "More chart actions" menu. */
export const ChartPdfButton = ({ targetRef, title, subtitle, columns, rows }: ChartPdfButtonProps) => {
  const { busy, exportPdf } = useChartPdf({ targetRef, title, subtitle, columns, rows });

  return (
    <Button type="button" variant="outline" size="sm" className="chart-action min-w-11 shrink-0 text-xs" onClick={exportPdf} disabled={busy}
      aria-label={`Download ${title} as PDF`} title="Download PDF" data-html2canvas-ignore="true">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileDown className="h-3.5 w-3.5" aria-hidden="true" />}
      {/* Under 360px the word is hidden (the icon, aria-label and tooltip stay) so range + PDF still share a row. */}
      <span className="ml-1 max-[359px]:sr-only">PDF</span>
    </Button>
  );
};
