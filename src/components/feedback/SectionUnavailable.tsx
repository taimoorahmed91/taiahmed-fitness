import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionUnavailableProps {
  /** "Report charts are paused". */
  title: string;
  /** Which data is missing and what happens next. */
  description: string;
  /** Match the height of the content this replaces, so the page does not jump. */
  minHeightClassName?: string;
  className?: string;
}

/**
 * A quiet stand-in for a section whose data never loaded. It carries no button: the page keeps ONE
 * retry (PartialDataNotice) so several paused sections do not each ask for the same thing.
 * It never shows zeros or "no data", because the data is unknown, not empty.
 */
export const SectionUnavailable = ({
  title,
  description,
  minHeightClassName = 'min-h-[10rem]',
  className,
}: SectionUnavailableProps) => (
  <Card className={cn('shadow-md', className)}>
    <CardContent className={cn('flex flex-col items-center justify-center gap-2 p-6 text-center', minHeightClassName)}>
      <AlertTriangle className="h-6 w-6 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);
