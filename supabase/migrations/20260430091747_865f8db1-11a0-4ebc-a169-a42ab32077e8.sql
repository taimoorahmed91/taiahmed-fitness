CREATE TABLE public.fittrack_personal_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  dob date,
  age integer,
  gender text,
  height_cm numeric,
  target_weight_kg numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.fittrack_personal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own personal data"
ON public.fittrack_personal_data FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personal data"
ON public.fittrack_personal_data FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personal data"
ON public.fittrack_personal_data FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own personal data"
ON public.fittrack_personal_data FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_fittrack_personal_data_updated_at
BEFORE UPDATE ON public.fittrack_personal_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();