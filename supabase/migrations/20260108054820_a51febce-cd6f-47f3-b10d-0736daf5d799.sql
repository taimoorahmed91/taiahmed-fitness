-- Create table for weight tracking
CREATE TABLE public.fittrack_weight (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  weight NUMERIC NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for sleep tracking
CREATE TABLE public.fittrack_sleep (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  hours NUMERIC NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.fittrack_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fittrack_sleep ENABLE ROW LEVEL SECURITY;

-- Weight RLS policies
CREATE POLICY "Users can view their own weight entries"
ON public.fittrack_weight FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own weight entries"
ON public.fittrack_weight FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weight entries"
ON public.fittrack_weight FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weight entries"
ON public.fittrack_weight FOR DELETE
USING (auth.uid() = user_id);

-- Sleep RLS policies
CREATE POLICY "Users can view their own sleep entries"
ON public.fittrack_sleep FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sleep entries"
ON public.fittrack_sleep FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sleep entries"
ON public.fittrack_sleep FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sleep entries"
ON public.fittrack_sleep FOR DELETE
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_fittrack_weight_updated_at
BEFORE UPDATE ON public.fittrack_weight
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fittrack_sleep_updated_at
BEFORE UPDATE ON public.fittrack_sleep
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();