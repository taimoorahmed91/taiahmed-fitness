-- Create workout templates table (stores user's custom workout routines)
CREATE TABLE public.fittrack_workout_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fittrack_workout_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own workout templates"
ON public.fittrack_workout_templates
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workout templates"
ON public.fittrack_workout_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout templates"
ON public.fittrack_workout_templates
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout templates"
ON public.fittrack_workout_templates
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_fittrack_workout_templates_updated_at
BEFORE UPDATE ON public.fittrack_workout_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();