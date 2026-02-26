
CREATE TABLE public.fittrack_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast queries by user
CREATE INDEX idx_fittrack_activity_logs_user_id ON public.fittrack_activity_logs(user_id);
CREATE INDEX idx_fittrack_activity_logs_created_at ON public.fittrack_activity_logs(created_at DESC);
CREATE INDEX idx_fittrack_activity_logs_category ON public.fittrack_activity_logs(category);

-- Enable RLS
ALTER TABLE public.fittrack_activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own logs
CREATE POLICY "Users can view their own activity logs"
  ON public.fittrack_activity_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own logs
CREATE POLICY "Users can insert their own activity logs"
  ON public.fittrack_activity_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
