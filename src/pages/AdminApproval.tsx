import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
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
      toast({
        title: 'Error',
        description: 'Failed to fetch pending users',
        variant: 'destructive',
      });
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
      toast({
        title: 'Error',
        description: 'Failed to approve user',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'User has been approved',
      });
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    }
    setApproving(null);
  };

  if (isOwner === null) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isOwner) {
    return null;
  }

  return (
    <main className="container py-6 space-y-6">
      <div className="flex items-center gap-3">
        <CheckCircle className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">User Approval</h1>
          <p className="text-muted-foreground">Review people who signed up and grant them access</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Pending users
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {pendingUsers.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle className="mx-auto mb-2 h-10 w-10 text-chart-min" />
              <p className="text-muted-foreground">All caught up — no pending users to approve</p>
            </div>
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
                      <Mail className="h-3 w-3" />
                      <span>{user.email || 'No email'}</span>
                    </div>
                    {user.created_at && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          Joined {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(user.id)}
                    disabled={approving === user.id}
                  >
                    {approving === user.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default AdminApproval;
