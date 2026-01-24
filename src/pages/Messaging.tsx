import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Info, MessageCircle, Save, Bell, BellOff, Mail, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NotificationScheduleForm } from '@/components/NotificationScheduleForm';

const Messaging = () => {
  const [telegramChatId, setTelegramChatId] = useState('');
  const [hasTelegramSet, setHasTelegramSet] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isEmailSubscribed, setIsEmailSubscribed] = useState(false);
  const [notificationSchedule, setNotificationSchedule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [emailSubscribing, setEmailSubscribing] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Set user email
        setUserEmail(user.email || '');

        const { data, error } = await supabase
          .from('fittrack_user_settings')
          .select('telegram_chat_id_set, telegram_subscribed, email_subscribed, notification_schedule')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setHasTelegramSet(data.telegram_chat_id_set || false);
          setIsSubscribed(data.telegram_subscribed || false);
          setIsEmailSubscribed(data.email_subscribed || false);
          setNotificationSchedule(data.notification_schedule || null);
        }
      } catch (error) {
        console.error('Error fetching messaging settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!telegramChatId.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a Telegram Chat ID',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to save settings',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ 
          telegram_chat_id: telegramChatId.trim(),
          telegram_chat_id_set: true 
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setHasTelegramSet(true);
      setTelegramChatId('');
      toast({
        title: 'Success',
        description: 'Telegram Chat ID saved successfully',
      });
    } catch (error) {
      console.error('Error saving Telegram Chat ID:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Telegram Chat ID',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubscriptionToggle = async (subscribe: boolean) => {
    setSubscribing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to change subscription',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ telegram_subscribed: subscribe })
        .eq('user_id', user.id);

      if (error) throw error;

      setIsSubscribed(subscribe);
      toast({
        title: 'Success',
        description: subscribe ? 'Subscribed to Telegram notifications' : 'Unsubscribed from Telegram notifications',
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to update subscription',
        variant: 'destructive',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleEmailSubscriptionToggle = async (subscribe: boolean) => {
    setEmailSubscribing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to change subscription',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ email_subscribed: subscribe })
        .eq('user_id', user.id);

      if (error) throw error;

      setIsEmailSubscribed(subscribe);
      toast({
        title: 'Success',
        description: subscribe ? 'Subscribed to email notifications' : 'Unsubscribed from email notifications',
      });
    } catch (error) {
      console.error('Error updating email subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to update email subscription',
        variant: 'destructive',
      });
    } finally {
      setEmailSubscribing(false);
    }
  };

  const handleScheduleSave = async (schedule: string) => {
    setScheduleSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to save schedule',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ notification_schedule: schedule })
        .eq('user_id', user.id);

      if (error) throw error;

      setNotificationSchedule(schedule);
      toast({
        title: 'Success',
        description: 'Notification schedule saved successfully',
      });
    } catch (error) {
      console.error('Error saving notification schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to save notification schedule',
        variant: 'destructive',
      });
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Messaging Settings</h1>

        <div className="grid lg:grid-cols-2 gap-6">
            {/* Telegram Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Telegram Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Chat ID Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Find the bot "n8n-fitness" in Telegram and send a hello message to get the chatID.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="telegram-chat-id"
                    type="text"
                    placeholder={hasTelegramSet ? "Leave blank if unchanged" : "Enter your Telegram Chat ID"}
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                  />
                  {hasTelegramSet && (
                    <p className="text-sm text-muted-foreground">
                      ✓ Telegram Chat ID is configured. Enter a new value only if you want to change it.
                    </p>
                  )}
                  <Button onClick={handleSave} disabled={saving || !telegramChatId.trim()}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>

                {/* Subscription Section */}
                <div className="pt-4 border-t space-y-3">
                  <Label>Notification Subscription</Label>
                  <p className="text-sm text-muted-foreground">
                    {isSubscribed 
                      ? '✓ You are subscribed to Telegram notifications.' 
                      : 'You are not subscribed to Telegram notifications.'}
                  </p>
                  <div className="flex gap-2">
                    {!isSubscribed && (
                      <Button 
                        onClick={() => handleSubscriptionToggle(true)} 
                        disabled={subscribing}
                        variant="default"
                      >
                        <Bell className="h-4 w-4 mr-2" />
                        {subscribing ? 'Subscribing...' : 'Subscribe'}
                      </Button>
                    )}
                    {isSubscribed && (
                      <Button 
                        onClick={() => handleSubscriptionToggle(false)} 
                        disabled={subscribing}
                        variant="outline"
                      >
                        <BellOff className="h-4 w-4 mr-2" />
                        {subscribing ? 'Unsubscribing...' : 'Unsubscribe'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email Display */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userEmail}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-sm text-muted-foreground">
                    This is your registered email address.
                  </p>
                </div>

                {/* Email Subscription Section */}
                <div className="pt-4 border-t space-y-3">
                  <Label>Email Subscription</Label>
                  <p className="text-sm text-muted-foreground">
                    {isEmailSubscribed 
                      ? '✓ You are subscribed to email notifications.' 
                      : 'You are not subscribed to email notifications.'}
                  </p>
                  <div className="flex gap-2">
                    {!isEmailSubscribed && (
                      <Button 
                        onClick={() => handleEmailSubscriptionToggle(true)} 
                        disabled={emailSubscribing}
                        variant="default"
                      >
                        <Bell className="h-4 w-4 mr-2" />
                        {emailSubscribing ? 'Subscribing...' : 'Subscribe'}
                      </Button>
                    )}
                    {isEmailSubscribed && (
                      <Button 
                        onClick={() => handleEmailSubscriptionToggle(false)} 
                        disabled={emailSubscribing}
                        variant="outline"
                      >
                        <BellOff className="h-4 w-4 mr-2" />
                        {emailSubscribing ? 'Unsubscribing...' : 'Unsubscribe'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Notification Schedule Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Notification Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure when you want to receive notifications. This generates a cron expression for n8n.
                </p>
                <NotificationScheduleForm
                  initialSchedule={notificationSchedule}
                  onSave={handleScheduleSave}
                  saving={scheduleSaving}
                />
                {notificationSchedule && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Current schedule:</p>
                    <code className="text-sm font-mono text-primary">{notificationSchedule}</code>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
  );
};

export default Messaging;