-- Create table for daily notes/symptoms tracking
CREATE TABLE public.fittrack_daily_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  severity INTEGER CHECK (severity >= 1 AND severity <= 5),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint for one note per user per date
CREATE UNIQUE INDEX fittrack_daily_notes_user_date_idx ON public.fittrack_daily_notes (user_id, date);

-- Enable Row Level Security
ALTER TABLE public.fittrack_daily_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own daily notes"
  ON public.fittrack_daily_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily notes"
  ON public.fittrack_daily_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily notes"
  ON public.fittrack_daily_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily notes"
  ON public.fittrack_daily_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_fittrack_daily_notes_updated_at
  BEFORE UPDATE ON public.fittrack_daily_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();