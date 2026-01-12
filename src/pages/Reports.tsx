import { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShareableSummary } from '@/components/ShareableSummary';
import { InsightCard } from '@/components/InsightCard';
import { ReportCharts } from '@/components/ReportCharts';
import { useReportData } from '@/hooks/useReportData';
import { useUser } from '@/contexts/UserContext';
import { Download, Share2, Flame, Dumbbell, Moon, Scale, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

type PeriodType = 'week' | 'month';

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
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || undefined;

  const handleDownload = async () => {
    if (!summaryRef.current) return;
    try {
      const canvas = await html2canvas(summaryRef.current, { backgroundColor: null, scale: 2 });
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
      const canvas = await html2canvas(summaryRef.current, { backgroundColor: null, scale: 2 });
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
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports & Insights</h1>
          <p className="text-muted-foreground mt-1">Analyze your fitness trends</p>
        </div>

        <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="week">Last 7 Days</TabsTrigger>
            <TabsTrigger value="month">Last 30 Days</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6 text-center"><Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" /><p className="text-2xl font-bold">{stats.avgCalories.toLocaleString()}</p><p className="text-sm text-muted-foreground">Avg Daily Calories</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><Dumbbell className="h-8 w-8 mx-auto mb-2 text-primary" /><p className="text-2xl font-bold">{stats.totalWorkouts}</p><p className="text-sm text-muted-foreground">Total Workouts</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><Moon className="h-8 w-8 mx-auto mb-2 text-indigo-500" /><p className="text-2xl font-bold">{stats.avgSleepHours}h</p><p className="text-sm text-muted-foreground">Avg Sleep</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><Scale className="h-8 w-8 mx-auto mb-2 text-teal-500" /><p className="text-2xl font-bold">{stats.avgWeight > 0 ? `${stats.avgWeight}kg` : '--'}</p><p className="text-sm text-muted-foreground">Avg Weight</p></CardContent></Card>
        </div>

        <ReportCharts data={chartData} />

        {correlationInsights.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-yellow-500" />Insights</CardTitle></CardHeader>
            <CardContent><div className="grid sm:grid-cols-2 gap-4">{correlationInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}</div></CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" />Share Your Progress</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center"><ShareableSummary ref={summaryRef} stats={stats} dateRange={dateRange} userName={userName} /></div>
            <div className="flex justify-center gap-3">
              <Button onClick={handleDownload} variant="outline"><Download className="h-4 w-4 mr-2" />Download</Button>
              <Button onClick={handleShare}><Share2 className="h-4 w-4 mr-2" />Share</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;