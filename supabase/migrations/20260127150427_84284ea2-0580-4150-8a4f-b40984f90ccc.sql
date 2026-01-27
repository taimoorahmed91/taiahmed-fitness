-- Add start_time column to fittrack_gym_sessions
ALTER TABLE public.fittrack_gym_sessions 
ADD COLUMN start_time text;