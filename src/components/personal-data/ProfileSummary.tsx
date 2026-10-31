import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SpokenText } from './SpokenText';
import type { ProfileSummaryModel, SummaryItem } from './model';

const GroupList = ({ title, editHref, editLabel, items, className }: {
  title: string;
  editHref: string;
  editLabel: string;
  items: SummaryItem[];
  className?: string;
}) => (
  <div className={cn('min-w-0 space-y-3', className)}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0 px-2 text-primary [@media(pointer:coarse)]:min-w-11">
        <a href={editHref}>
          Edit<span className="sr-only"> {editLabel}</span>
        </a>
      </Button>
    </div>
    <dl className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3 sm:space-y-0 md:block md:space-y-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 break-words">
            <span className={cn('block tabular-nums', it.set ? 'text-base font-semibold' : 'text-muted-foreground')}>
              <SpokenText value={{ text: it.value, spoken: it.spoken ?? it.value }} />
            </span>
            {it.detail && <span className="block text-sm text-muted-foreground">{it.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  </div>
);

/**
 * The top of the page: every saved setting that matters, read at a glance, three short columns on a wide
 * screen and one column on a phone. Each column links down to the section that edits it. It shows what is
 * SAVED, so it never changes while someone is still typing. Empty values say "Not set" in words.
 */
export const ProfileSummary = ({ model }: { model: ProfileSummaryModel }) => {
  const headingId = useId();
  return (
    <section id="summary" aria-labelledby={headingId} className="scroll-mt-20">
      <Card headingLevel="h2" titleSize="chart">
        <CardHeader className="pb-4">
          <CardTitle id={headingId}>Your settings at a glance</CardTitle>
          <CardDescription>What is saved right now. Use Edit to jump to a section.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3 md:gap-0">
          <GroupList
            title="Body"
            editHref="#profile"
            editLabel="profile and body"
            items={model.body}
            className="md:pr-6"
          />
          <GroupList
            title="Daily nutrition"
            editHref="#targets"
            editLabel="nutrition targets"
            items={model.nutrition}
            className="border-t pt-6 md:border-l md:border-t-0 md:px-6 md:pt-0"
          />
          <GroupList
            title="Training"
            editHref="#schedule"
            editLabel="training schedule"
            items={model.training}
            className="border-t pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0"
          />
        </CardContent>
      </Card>
    </section>
  );
};
