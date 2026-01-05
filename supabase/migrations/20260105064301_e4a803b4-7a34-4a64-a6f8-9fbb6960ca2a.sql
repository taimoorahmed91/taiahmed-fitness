-- Create fittrack_meals table
CREATE TABLE public.fittrack_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  food TEXT NOT NULL,
  calories INTEGER NOT NULL,
  time TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fittrack_gym_sessions table
CREATE TABLE public.fittrack_gym_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exercise TEXT NOT NULL,
  duration INTEGER NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.fittrack_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fittrack_gym_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fittrack_meals
CREATE POLICY "Users can view their own meals" 
ON public.fittrack_meals 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meals" 
ON public.fittrack_meals 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meals" 
ON public.fittrack_meals 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meals" 
ON public.fittrack_meals 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for fittrack_gym_sessions
CREATE POLICY "Users can view their own gym sessions" 
ON public.fittrack_gym_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own gym sessions" 
ON public.fittrack_gym_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gym sessions" 
ON public.fittrack_gym_sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gym sessions" 
ON public.fittrack_gym_sessions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_fittrack_meals_user_id ON public.fittrack_meals(user_id);
CREATE INDEX idx_fittrack_meals_date ON public.fittrack_meals(date);
CREATE INDEX idx_fittrack_gym_sessions_user_id ON public.fittrack_gym_sessions(user_id);
CREATE INDEX idx_fittrack_gym_sessions_date ON public.fittrack_gym_sessions(date);

-- Create trigger for automatic timestamp updates on meals
CREATE TRIGGER update_fittrack_meals_updated_at
BEFORE UPDATE ON public.fittrack_meals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for automatic timestamp updates on gym sessions
CREATE TRIGGER update_fittrack_gym_sessions_updated_at
BEFORE UPDATE ON public.fittrack_gym_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();