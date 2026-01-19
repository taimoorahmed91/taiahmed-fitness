-- Create a table for waist measurements
CREATE TABLE public.fittrack_waist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  waist NUMERIC NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.fittrack_waist ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own waist entries" 
ON public.fittrack_waist 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own waist entries" 
ON public.fittrack_waist 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own waist entries" 
ON public.fittrack_waist 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own waist entries" 
ON public.fittrack_waist 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_fittrack_waist_updated_at
BEFORE UPDATE ON public.fittrack_waist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();