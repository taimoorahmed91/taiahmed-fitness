import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/contexts/UserContext';

const PendingApproval = () => {
  const { logout } = useUser();

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <Clock className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Please wait to be allowed</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Your account is pending approval. You will be notified once your access has been granted.
          </p>
          <Button variant="outline" onClick={logout} className="w-full">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default PendingApproval;
