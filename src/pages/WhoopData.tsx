import { Navigation } from '@/components/Navigation';
import { useWhoopData } from '@/hooks/useWhoopData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Activity, Heart, Moon, Flame } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const formatMilliToHours = (milli: number | null) => {
  if (milli === null || milli === undefined) return '-';
  return (milli / 3600000).toFixed(1) + 'h';
};

const WhoopData = () => {
  const { entries, loading, fetching, fetchFromAPI, deleteEntry } = useWhoopData();

  const handleFetch = () => {
    fetchFromAPI();
  };

  const latestEntry = entries[0];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container py-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">WHOOP Data</h1>
            <p className="text-muted-foreground">Fetch and track your WHOOP recovery, sleep, and strain data</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={handleFetch} disabled={fetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? 'Syncing...' : 'Sync Now'}
            </Button>
            <p className="text-xs text-muted-foreground">Auto-syncs daily at 14:00 CET</p>
          </div>
        </div>

        {/* Summary Cards */}
        {latestEntry && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Activity className="h-4 w-4" /> Recovery
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{latestEntry.recovery_score ?? '-'}%</div>
                <p className="text-xs text-muted-foreground">HRV: {latestEntry.hrv_rmssd_milli ?? '-'}ms</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Heart className="h-4 w-4" /> Heart Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{latestEntry.resting_heart_rate ?? '-'} bpm</div>
                <p className="text-xs text-muted-foreground">SpO2: {latestEntry.spo2_percentage ?? '-'}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Moon className="h-4 w-4" /> Sleep
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{latestEntry.sleep_performance_percentage ?? '-'}%</div>
                <p className="text-xs text-muted-foreground">In bed: {latestEntry.total_in_bed_hours ?? '-'}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Flame className="h-4 w-4" /> Strain
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{latestEntry.strain != null ? Number(latestEntry.strain).toFixed(1) : '-'}</div>
                <p className="text-xs text-muted-foreground">{latestEntry.kilojoule != null ? Math.round(Number(latestEntry.kilojoule) / 4.184) : '-'} cal</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>{entries.length} entries</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No WHOOP data yet. Enter your API key and click Fetch.</p>
            ) : (
              <ScrollArea className="w-full">
                <div className="min-w-[1200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Recovery</TableHead>
                        <TableHead>HRV</TableHead>
                        <TableHead>RHR</TableHead>
                        <TableHead>SpO2</TableHead>
                        <TableHead>Skin Temp</TableHead>
                        <TableHead>Sleep Perf</TableHead>
                        <TableHead>Sleep Eff</TableHead>
                        <TableHead>In Bed</TableHead>
                        <TableHead>REM</TableHead>
                        <TableHead>Deep</TableHead>
                        <TableHead>Light</TableHead>
                        <TableHead>Awake</TableHead>
                        <TableHead>Resp Rate</TableHead>
                        <TableHead>Disturbances</TableHead>
                        <TableHead>Cycles</TableHead>
                        <TableHead>Strain</TableHead>
                        <TableHead>Calories</TableHead>
                        <TableHead>Avg HR</TableHead>
                        <TableHead>Max HR</TableHead>
                        
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteEntry(entry.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                              {entry.date}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              (entry.recovery_score ?? 0) >= 67 ? 'default' :
                              (entry.recovery_score ?? 0) >= 34 ? 'secondary' : 'destructive'
                            }>
                              {entry.recovery_score ?? '-'}%
                            </Badge>
                          </TableCell>
                          <TableCell>{entry.hrv_rmssd_milli ?? '-'}</TableCell>
                          <TableCell>{entry.resting_heart_rate ?? '-'}</TableCell>
                          <TableCell>{entry.spo2_percentage ?? '-'}%</TableCell>
                          <TableCell>{entry.skin_temp_celsius != null ? `${Number(entry.skin_temp_celsius).toFixed(1)}°C` : '-'}</TableCell>
                          <TableCell>{entry.sleep_performance_percentage ?? '-'}%</TableCell>
                          <TableCell>{entry.sleep_efficiency_percentage ?? '-'}%</TableCell>
                          <TableCell>{entry.total_in_bed_hours ?? '-'}h</TableCell>
                          <TableCell>{formatMilliToHours(entry.total_rem_sleep_milli)}</TableCell>
                          <TableCell>{formatMilliToHours(entry.total_deep_sleep_milli)}</TableCell>
                          <TableCell>{formatMilliToHours(entry.total_light_sleep_milli)}</TableCell>
                          <TableCell>{formatMilliToHours(entry.total_awake_time_milli)}</TableCell>
                          <TableCell>{entry.respiratory_rate != null ? Number(entry.respiratory_rate).toFixed(1) : '-'}</TableCell>
                          <TableCell>{entry.disturbance_count ?? '-'}</TableCell>
                          <TableCell>{entry.sleep_cycle_count ?? '-'}</TableCell>
                          <TableCell>{entry.strain != null ? Number(entry.strain).toFixed(1) : '-'}</TableCell>
                          <TableCell>{entry.kilojoule != null ? Number(entry.kilojoule).toFixed(0) : '-'}</TableCell>
                          <TableCell>{entry.average_heart_rate ?? '-'}</TableCell>
                          <TableCell>{entry.max_heart_rate ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WhoopData;
