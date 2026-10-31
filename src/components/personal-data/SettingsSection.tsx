import { useId, type ComponentType, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/**
 * One titled block of settings. There are two kinds, and the page uses each for one job:
 *
 *  - Always open (default): the main profile, targets and schedule. Their current values must never be hidden.
 *  - `collapsible`: occasional settings (rest timers, insight cutoffs, the MCP token). The header stays visible and
 *    always carries a one-line `summary` of the current value, so closing the section never hides what is set.
 *
 * Both draw the same header (icon tile, heading, one-line text) so the page reads as one system.
 * The heading is an h2 for page sections and an h3 when the section sits under another h2.
 */
export interface SettingsSectionProps {
  id?: string;
  icon: IconComponent;
  title: string;
  /** Static sections: shown under the title. */
  description?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  collapsible?: boolean;
  /** Collapsible sections: the current value in one line. Always visible, also while closed. */
  summary?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

const IconTile = ({ icon: Icon }: { icon: IconComponent }) => (
  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
    <Icon className="h-5 w-5" aria-hidden="true" />
  </span>
);

export const SettingsSection = ({
  id, icon, title, description, headingLevel = 'h2', collapsible = false, summary,
  open, defaultOpen = false, onOpenChange, className, children,
}: SettingsSectionProps) => {
  const headingId = useId();
  const summaryId = useId();
  const Heading = headingLevel;

  if (!collapsible) {
    return (
      <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-20', className)}>
        <Card>
          <div className="flex items-start gap-3 p-[var(--card-pad)] pb-4">
            <IconTile icon={icon} />
            <div className="min-w-0">
              <Heading id={headingId} className="text-lg font-semibold leading-tight tracking-tight">{title}</Heading>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          <CardContent className="divide-y divide-border">{children}</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-20', className)}>
      <Collapsible open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} className="group/section">
        <Card>
          <Heading id={headingId}>
            <CollapsibleTrigger asChild>
              {/* The visible text is the title plus the summary; the name stays short and the summary is read as its description. */}
              <Button
                type="button"
                variant="ghost"
                aria-label={title}
                aria-describedby={summary ? summaryId : undefined}
                className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-lg p-[var(--card-pad)] text-left font-normal"
              >
                <IconTile icon={icon} />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-tight tracking-tight">{title}</span>
                  {summary && <span id={summaryId} className="mt-1 block text-sm text-muted-foreground">{summary}</span>}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/section:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
          </Heading>
          <CollapsibleContent>
            <CardContent className="border-t pt-[var(--card-pad)]">{children}</CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </section>
  );
};
