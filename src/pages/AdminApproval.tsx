import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle, User, Mail, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface PendingUser {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
}

const AdminApproval = () => {
  const { isOwner } = useUser();
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner === false) {
      navigate('/dashboard');
      return;
    }
    
    if (isOwner) {
      fetchPendingUsers();
    }
  }, [isOwner, navigate]);

  const fetchPendingUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .or('approved.is.null,approved.neq.yes')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending users:', error);
      toast.error('Failed to fetch pending users');
    } else {
      setPendingUsers(data || []);
    }
    setLoading(false);
  };

  const handleApprove = async (userId: string) => {
    setApproving(userId);
    
    const { error } = await supabase
      .from('profiles')
      .update({ approved: 'yes' })
      .eq('id', userId);

    if (error) {
      console.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } else {
      toast.success('User has been approved');
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    }
    setApproving(null);
  };

  if (isOwner === null) {
    return (
      <PageContainer>
        <PageHeader icon={CheckCircle} title="User Approval" description="Review people who signed up and grant them access" />
        <PageLoading label="Checking your access" rows={2} />
      </PageContainer>
    );
  }

  if (!isOwner) {
    return null;
  }

  return (
    <PageContainer>
      <PageHeader icon={CheckCircle} title="User Approval" description="Review people who signed up and grant them access" />
      <PageSection title="Pending approvals" hideTitle>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" aria-hidden="true" />
              Pending users
              {!loading && (
                <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {pendingUsers.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <PageLoading label="Loading pending users" rows={2} />
            ) : pendingUsers.length === 0 ? (
              <PageEmptyState icon={CheckCircle} title="All caught up" description="No pending users to approve." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 p-4 rounded-lg border bg-card"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                      {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {user.full_name || 'No name'}
                        </span>
                        {user.created_at && (
                          <span className="text-xs text-muted-foreground">
                            · waiting {Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))}d
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        <span>{user.email || 'No email'}</span>
                      </div>
                      {user.created_at && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span>
                            Joined {format(new Date(user.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="touch"
                      onClick={() => handleApprove(user.id)}
                      loading={approving === user.id}
                      aria-label={`Approve ${user.full_name || user.email || 'user'}`}
                    >
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      Approve
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default AdminApproval;
