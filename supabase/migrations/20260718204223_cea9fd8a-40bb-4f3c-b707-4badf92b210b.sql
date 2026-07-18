
CREATE TABLE public.fittrack_extra_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity TEXT NOT NULL,
  intensity SMALLINT NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fittrack_extra_activities TO authenticated;
GRANT ALL ON public.fittrack_extra_activities TO service_role;

ALTER TABLE public.fittrack_extra_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own extra activities"
  ON public.fittrack_extra_activities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extra activities"
  ON public.fittrack_extra_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own extra activities"
  ON public.fittrack_extra_activities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extra activities"
  ON public.fittrack_extra_activities FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_fittrack_extra_activities_updated_at
  BEFORE UPDATE ON public.fittrack_extra_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fittrack_extra_activities_user_date
  ON public.fittrack_extra_activities(user_id, date DESC);
