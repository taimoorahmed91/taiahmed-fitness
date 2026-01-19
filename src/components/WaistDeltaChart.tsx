import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { TrendingDown } from 'lucide-react';

interface WaistEntry {
  date: string;
  waist: number;
}

interface WaistDeltaChartProps {
  data: WaistEntry[];
}

interface DeltaData {
  date: string;
  delta: number;
  days: number;
  cmPerWeek: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DeltaData;
    const sign = data.delta >= 0 ? '+' : '';
    const signWeek = data.cmPerWeek >= 0 ? '+' : '';
    
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-1">{data.date}</p>
        <p className="text-sm text-muted-foreground">
          Change: <span className={`font-semibold ${data.delta < 0 ? 'text-green-500' : 'text-red-500'}`}>
            {sign}{data.delta.toFixed(2)} cm
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          Days: <span className="font-semibold text-foreground">{data.days}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Pace: <span className={`font-semibold ${data.cmPerWeek < 0 ? 'text-green-500' : 'text-red-500'}`}>
            {signWeek}{data.cmPerWeek.toFixed(2)} cm/week
          </span>
        </p>
      </div>
    );
  }
  return null;
};

export const WaistDeltaChart = ({ data }: WaistDeltaChartProps) => {
  const { deltaData, lastInterval, overallProgress } = useMemo(() => {
    const validData = data.filter(d => d.waist > 0);
    
    // Sort by date ascending for proper delta calculation
    const sortedData = [...validData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    if (sortedData.length < 2) {
      return { deltaData: [], lastInterval: null, overallProgress: null };
    }
    
    const deltas: DeltaData[] = [];
    
    for (let i = 1; i < sortedData.length; i++) {
      const prev = sortedData[i - 1];
      const curr = sortedData[i];
      
      const prevDate = new Date(prev.date);
      const currDate = new Date(curr.date);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > 0) {
        const waistChange = curr.waist - prev.waist;
        const cmPerWeek = (waistChange / daysDiff) * 7;
        
        // Format date for display (MM/DD)
        const displayDate = `${String(currDate.getMonth() + 1).padStart(2, '0')}/${String(currDate.getDate()).padStart(2, '0')}`;
        
        deltas.push({
          date: displayDate,
          delta: waistChange,
          days: daysDiff,
          cmPerWeek,
        });
      }
    }
    
    const lastIntervalData = deltas.length > 0 ? deltas[deltas.length - 1] : null;
    
    // Calculate overall progress
    let overallProgressData = null;
    if (sortedData.length >= 2) {
      const first = sortedData[0];
      const last = sortedData[sortedData.length - 1];
      const totalChange = last.waist - first.waist;
      const totalDays = Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));
      
      if (totalDays > 0) {
        overallProgressData = {
          change: totalChange,
          days: totalDays,
          cmPerWeek: (totalChange / totalDays) * 7,
        };
      }
    }
    
    return { 
      deltaData: deltas.slice(-10), // Show last 10 intervals
      lastInterval: lastIntervalData, 
      overallProgress: overallProgressData 
    };
  }, [data]);

  if (deltaData.length === 0) {
    return null;
  }

  const formatSummary = (change: number, days: number, cmPerWeek: number) => {
    const sign = change >= 0 ? '+' : '';
    const signWeek = cmPerWeek >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} cm in ${days} days (${signWeek}${cmPerWeek.toFixed(2)} cm/week)`;
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-primary" />
            Waist Change
          </CardTitle>
        </div>
        {(lastInterval || overallProgress) && (
          <div className="mt-2 space-y-1">
            {lastInterval && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Last:</span>{' '}
                <span className={lastInterval.delta < 0 ? 'text-green-500' : 'text-red-500'}>
                  {formatSummary(lastInterval.delta, lastInterval.days, lastInterval.cmPerWeek)}
                </span>
              </p>
            )}
            {overallProgress && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Overall:</span>{' '}
                <span className={overallProgress.change < 0 ? 'text-green-500' : 'text-red-500'}>
                  {formatSummary(overallProgress.change, overallProgress.days, overallProgress.cmPerWeek)}
                </span>
              </p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deltaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Bar dataKey="delta" radius={[4, 4, 0, 0]}>
                {deltaData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.delta < 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
