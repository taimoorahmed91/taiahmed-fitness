import { useState, useRef } from 'react';
import { PageContainer, PageHeader, PageSection } from '@/components/layout/Page';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { LoadingAnnouncement } from '@/components/feedback/LoadingAnnouncement';
import { PartialDataNotice } from '@/components/feedback/PartialDataNotice';
import { SectionUnavailable } from '@/components/feedback/SectionUnavailable';
import { joinLabels, type TableView } from '@/components/feedback/tableView';
import { REPORT_TABLE_LABELS, resolveReportData, type ReportTable } from '@/components/feedback/reportSections';
import { useSharedTableState } from '@/lib/sharedTable';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useSleep } from '@/hooks/useSleep';
import { useWhoopData } from '@/hooks/useWhoopData';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShareableSummary } from '@/components/ShareableSummary';
import { InsightCard } from '@/components/InsightCard';
import { ReportCharts } from '@/components/ReportCharts';
import { useReportData } from '@/hooks/useReportData';
import { useCrossMetricInsights } from '@/hooks/useCrossMetricInsights';
import { WeeklyDigestCard } from '@/components/WeeklyDigestCard';
import { BodyRecompositionCard } from '@/components/BodyRecompositionCard';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useUser } from '@/contexts/UserContext';
import { Download, Share2, Flame, Dumbbell, Moon, Scale, Lightbulb, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

type PeriodType = 'week' | 'month';

/** One summary number. Shows a same-size skeleton while its table loads and a dash if it never did. */
const StatTile = ({ icon: Icon, iconClassName, value, label, view }: { icon: LucideIcon; iconClassName: string; value: string; label: string; view: TableView }) => {
  if (view === 'loading') return <CardSkeleton noHeader bodyClassName="h-[5.75rem]" />;
  const unavailable = view === 'error';
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <Icon className={`h-8 w-8 mx-auto mb-2 ${iconClassName}`} aria-hidden="true" />
        <p className="text-2xl font-bold">{unavailable ? '--' : value}</p>
        <p className="text-sm text-muted-foreground">{label}{unavailable && <span className="block text-xs">Couldn't load</span>}</p>
      </CardContent>
    </Card>
  );
};

const Reports = () => {
  const { user } = useUser();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('week');

  const getDateRange = () => {
    const today = new Date();
    if (periodType === 'week') {
      const from = new Date(today);
      from.setDate(today.getDate() - 7);
      return { from, to: today };
    }
    const from = new Date(today);
    from.setDate(today.getDate() - 30);
    return { from, to: today };
  };

  const dateRange = getDateRange();
  const { stats, chartData, correlationInsights } = useReportData(dateRange);
  const crossInsights = useCrossMetricInsights(dateRange.from.toISOString().slice(0, 10));
  const { entries: weightEntries, refetch: refetchWeight } = useWeight();
  const { entries: waistEntries, refetch: refetchWaist } = useWaist();
  const { refetch: refetchMeals } = useMeals();
  const { refetch: refetchGym } = useGymSessions();
  const { refetch: refetchSleep } = useSleep();
  const { refetch: refetchWhoop } = useWhoopData();

  // Where each table really is. Zeros and "no data" only mean something once the table has loaded,
  // so every part below waits for the tables it is computed from (an error shows as soon as it happens).
  const data = resolveReportData({
    meals: useSharedTableState('meals'),
    gym_sessions: useSharedTableState('gym_sessions'),
    weight: useSharedTableState('weight'),
    waist: useSharedTableState('waist'),
    sleep: useSharedTableState('sleep'),
    whoop: useSharedTableState('whoop'),
  });
  const { sections } = data;
  const retryers: Record<ReportTable, () => Promise<void>> = {
    meals: refetchMeals,
    gym_sessions: refetchGym,
    weight: refetchWeight,
    waist: refetchWaist,
    sleep: refetchSleep,
    whoop: refetchWhoop,
  };
  // Reload only what failed (never loaded, or kept stale rows). Joins any fetch already running.
  const retryFailed = async () => {
    await Promise.all([...data.failed, ...data.stale].map((table) => retryers[table]()));
  };
  const pausedText = (needs: string[]) => `Needs your ${joinLabels(needs)}, which didn't load. Use Try again at the top of the page.`;
  const allInsights = [...crossInsights, ...correlationInsights];
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || undefined;

  // Loaded on first export so the image library never ships with the Reports page itself.
  const renderSummaryCanvas = async (node: HTMLElement) => {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(node, { backgroundColor: null, scale: 2 });
  };

  const handleDownload = async () => {
    if (!summaryRef.current) return;
    try {
      const canvas = await renderSummaryCanvas(summaryRef.current);
      const link = document.createElement('a');
      link.download = `fittrack-summary.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Summary downloaded!');
    } catch {
      toast.error('Failed to generate image');
    }
  };

  const handleShare = async () => {
    if (!summaryRef.current) return;
    try {
      const canvas = await renderSummaryCanvas(summaryRef.current);
      canvas.toBlob(async (blob) => {
        if (!blob) return handleDownload();
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], 'fittrack-summary.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'My FitTrack Progress' });
            toast.success('Shared!');
            return;
          }
        }
        handleDownload();
      }, 'image/png');
    } catch {
      handleDownload();
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Reports & Insights" description="Analyze your fitness trends" />

      <LoadingAnnouncement loading={data.loading} label="Loading report data" />

      {/* One persistent notice (not a toast) when only some tables failed. Sections that need them are paused below. */}
      <PartialDataNotice
        failed={data.failed.map((t) => REPORT_TABLE_LABELS[t])}
        stale={data.stale.map((t) => REPORT_TABLE_LABELS[t])}
        onRetry={retryFailed}
      />

      <PageSection title="Weekly digest" hideTitle>
        {sections.digest.view === 'loading' ? (
          <CardSkeleton bodyClassName="h-[14rem]" />
        ) : sections.digest.view === 'error' ? (
          <SectionUnavailable title="This week at a glance is paused" description={pausedText(sections.digest.missing)} minHeightClassName="min-h-[14rem]" />
        ) : (
          <WeeklyDigestCard />
        )}
      </PageSection>

      <PageSection
        title="Progress report"
        description="Pick a period to update the numbers and charts below."
        actions={
          <SegmentedControl<PeriodType>
            ariaLabel="Report period"
            value={periodType}
            onValueChange={setPeriodType}
            options={[
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
            ]}
          />
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile icon={Flame} iconClassName="text-primary" value={stats.avgCalories.toLocaleString()} label="Avg Daily Calories" view={sections.statCalories.view} />
          <StatTile icon={Dumbbell} iconClassName="text-primary" value={String(stats.totalWorkouts)} label="Total Workouts" view={sections.statWorkouts.view} />
          <StatTile icon={Moon} iconClassName="text-chart-2" value={`${stats.avgSleepHours}h`} label="Avg Sleep" view={sections.statSleep.view} />
          <StatTile icon={Scale} iconClassName="text-chart-3" value={stats.avgWeight > 0 ? `${stats.avgWeight}kg` : '--'} label="Avg Weight" view={sections.statWeight.view} />
        </div>

        {sections.charts.view === 'loading' ? (
          <div className="grid lg:grid-cols-2 gap-6"><CardSkeleton bodyClassName="h-[300px]" /><CardSkeleton bodyClassName="h-[300px]" /></div>
        ) : sections.charts.view === 'error' ? (
          <SectionUnavailable title="Report charts are paused" description={pausedText(sections.charts.missing)} minHeightClassName="min-h-[22rem]" />
        ) : (
          <ReportCharts data={chartData} />
        )}

        {sections.recomposition.view === 'loading' ? (
          <CardSkeleton bodyClassName="h-[300px]" />
        ) : sections.recomposition.view === 'error' ? (
          <SectionUnavailable title="Body recomposition is paused" description={pausedText(sections.recomposition.missing)} minHeightClassName="min-h-[16rem]" />
        ) : (
          <BodyRecompositionCard weight={weightEntries.map(w => ({ date: w.date, value: w.weight }))} waist={waistEntries.map(w => ({ date: w.date, value: w.waist }))} />
        )}
      </PageSection>

      <PageSection title="Insights and sharing" hideTitle>
        {sections.insights.view === 'error' ? (
          <SectionUnavailable title="Insights are paused" description={pausedText(sections.insights.missing)} minHeightClassName="min-h-[8rem]" />
        ) : sections.insights.view === 'ready' && allInsights.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />Insights</CardTitle></CardHeader>
            <CardContent><div className="grid sm:grid-cols-2 gap-4">{allInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}</div></CardContent>
          </Card>
        )}

        {sections.share.view === 'loading' ? (
          <CardSkeleton bodyClassName="h-[28rem]" />
        ) : sections.share.view === 'error' ? (
          <SectionUnavailable title="Your progress summary is paused" description={pausedText(sections.share.missing)} minHeightClassName="min-h-[16rem]" />
        ) : (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Share2 className="h-5 w-5" aria-hidden="true" />Share Your Progress</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center"><ShareableSummary ref={summaryRef} stats={stats} dateRange={dateRange} userName={userName} /></div>
              <div className="flex justify-center gap-3">
                <Button onClick={handleDownload} variant="outline"><Download className="h-4 w-4 mr-2" aria-hidden="true" />Download</Button>
                <Button onClick={handleShare}><Share2 className="h-4 w-4 mr-2" aria-hidden="true" />Share</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </PageSection>
    </PageContainer>
  );
};

export default Reports;