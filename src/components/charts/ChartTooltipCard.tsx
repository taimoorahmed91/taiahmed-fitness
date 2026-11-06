import { ReactNode } from 'react';

export interface TooltipRow {
  label: string;
  value: string;
  /** CSS colour of the series, shown as a small swatch next to the label. */
  color?: string;
}

/** Shared tooltip body: card surface, 12px+ text, swatch + label + value per row. */
export const ChartTooltipCard = ({ title, rows, children }: { title: string; rows?: TooltipRow[]; children?: ReactNode }) => (
  <div className="chart-tooltip max-w-64 rounded-lg px-3 py-2.5 text-xs text-popover-foreground">
    <p className="mb-1.5 border-b border-foreground/10 pb-1.5 text-sm font-semibold leading-tight">{title}</p>
    {rows?.map((row) => (
      <p key={row.label} className="flex items-center gap-2 py-0.5 leading-snug">
        {row.color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-foreground/20" style={{ backgroundColor: row.color }} aria-hidden="true" />}
        <span className="text-muted-foreground">{row.label}</span>
        <span className="ml-auto pl-3 font-semibold tabular-nums">{row.value}</span>
      </p>
    ))}
    {children}
  </div>
);

export const TooltipNote = ({ tags, notes }: { tags?: string[]; notes?: string | null }) => (
  <div className="mt-2 border-t border-foreground/10 pt-2">
    <p className="font-medium">&#9670; Note for this day</p>
    {tags && tags.length > 0 && <p className="text-muted-foreground">{tags.join(', ')}</p>}
    {notes && <p className="break-words text-muted-foreground">{notes}</p>}
  </div>
);
