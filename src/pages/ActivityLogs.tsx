import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, RefreshCw, Search, Filter, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { IconButton } from '@/components/ui/icon-button';
import { format } from 'date-fns';

interface ActivityLog {
  id: string;
  action: string;
  category: string;
  status: string;
  details: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  weight: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  meal: 'bg-primary/10 text-primary border-primary/20',
  sleep: 'bg-chart-5/10 text-chart-5 border-chart-5/20',
  gym: 'bg-chart-min/10 text-chart-min border-chart-min/20',
  waist: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  daily_notes: 'bg-primary/10 text-primary border-primary/20',
  goals: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
  workout_templates: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  settings: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20',
  auth: 'bg-chart-max/10 text-chart-max border-chart-max/20',
};

const ACTION_LABELS: Record<string, string> = {
  create: '➕ Created',
  update: '✏️ Updated',
  delete: '🗑️ Deleted',
  view: '👁️ Viewed',
  login: '🔑 Logged In',
  logout: '🚪 Logged Out',
  start_workout: '🏋️ Started Workout',
  finish_workout: '✅ Finished Workout',
  cancel_workout: '❌ Cancelled Workout',
  export: '📤 Exported',
  import: '📥 Imported',
};

const CATEGORIES = [
  'all', 'weight', 'meal', 'sleep', 'gym', 'waist', 
  'daily_notes', 'goals', 'workout_templates', 'settings', 'auth'
];

const ActivityLogs = () => {
  const { user } = useUser();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchLogs = useCallback(async (reset = false) => {
    if (!user) return;
    setLoading(true);

    try {
      const currentPage = reset ? 0 : page;
      let query = supabase
        .from('fittrack_activity_logs' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typedData = (data || []) as unknown as ActivityLog[];
      
      if (reset) {
        setLogs(typedData);
        setPage(0);
      } else {
        setLogs(prev => currentPage === 0 ? typedData : [...prev, ...typedData]);
      }
      setHasMore(typedData.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  }, [user, page, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchLogs(true);
  }, [user, categoryFilter, statusFilter]);

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  useEffect(() => {
    if (page > 0) fetchLogs();
  }, [page]);

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.category.toLowerCase().includes(q) ||
      JSON.stringify(log.details).toLowerCase().includes(q) ||
      (log.error_message && log.error_message.toLowerCase().includes(q))
    );
  });

  const formatDetails = (details: Record<string, unknown>): string => {
    if (!details || Object.keys(details).length === 0) return 'No additional details';
    return JSON.stringify(details, null, 2);
  };

  // Don't show "0 logs" while the first page is still on its way.
  const showStatsPlaceholder = loading && logs.length === 0;

  return (
    <PageContainer>
      <PageHeader icon={FileText} title="Audit Log" description="Complete audit trail of all your actions" />

      <PageSection title="Search and filters" hideTitle>
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Search logs..."
                  aria-label="Search logs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by category">
                  <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px]" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <IconButton label="Refresh audit log" tooltip variant="outline" onClick={() => fetchLogs(true)} disabled={loading} className="self-start sm:self-auto">
                <RefreshCw className={loading ? 'animate-spin' : ''} />
              </IconButton>
            </div>
          </CardContent>
        </Card>
      </PageSection>

      <PageSection title="Summary" hideTitle>
        {/* Log Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{showStatsPlaceholder ? '–' : filteredLogs.length}</p>
              <p className="text-xs text-muted-foreground">Logs Shown</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-chart-min">
                {showStatsPlaceholder ? '–' : filteredLogs.filter(l => l.status === 'success').length}
              </p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-destructive">
                {showStatsPlaceholder ? '–' : filteredLogs.filter(l => l.status === 'error').length}
              </p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">
                {showStatsPlaceholder ? '–' : new Set(filteredLogs.map(l => l.category)).size}
              </p>
              <p className="text-xs text-muted-foreground">Categories</p>
            </CardContent>
          </Card>
        </div>
      </PageSection>

      <PageSection title="Audit trail" hideTitle>
        {/* Logs List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {filteredLogs.length === 0 ? (
                loading ? (
                  <PageLoading label="Loading audit log" rows={5} />
                ) : (
                  <PageEmptyState icon={FileText} title="No audit entries found" description="Try a different search or filter." />
                )
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                        log.status === 'error' ? 'border-destructive/30 bg-destructive/5' : ''
                      }`}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={expandedLog === log.id}
                        aria-label={`${log.category.replace('_', ' ')} ${log.action}, ${format(new Date(log.created_at), 'MMM d, HH:mm:ss')}${log.status === 'error' ? ', error' : ''}`}
                        className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedLog(expandedLog === log.id ? null : log.id);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <Badge variant="outline" className={CATEGORY_COLORS[log.category] || ''}>
                            {log.category.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm font-medium">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                          {log.status === 'error' && (
                            <Badge variant="destructive" className="text-xs">Error</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                          </div>
                          {expandedLog === log.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {expandedLog === log.id && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {log.error_message && (
                            <div className="text-sm text-destructive">
                              <strong>Error:</strong> {log.error_message}
                            </div>
                          )}
                          <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                            {formatDetails(log.details)}
                          </pre>
                          <p className="text-xs text-muted-foreground">
                            Full timestamp: {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss.SSS')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {hasMore && !loading && (
                <div className="text-center pt-4">
                  <Button variant="outline" onClick={handleLoadMore}>
                    Load More
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default ActivityLogs;
