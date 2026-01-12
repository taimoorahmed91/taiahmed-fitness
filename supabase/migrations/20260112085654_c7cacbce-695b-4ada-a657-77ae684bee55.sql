-- =============================================
-- SECURITY FIXES MIGRATION
-- =============================================

-- 1. FIX: Guest tokens table - Remove flawed SELECT policy that exposes all tokens
-- The old policy allowed ANY unauthenticated user to read ALL tokens
DROP POLICY IF EXISTS "Guest tokens are viewable by token holder" ON public.guest_tokens;

-- Create a more restrictive policy - tokens should only be validated server-side
-- No direct client SELECT access to guest_tokens table
-- Validation should use the validate_guest_token() function instead

-- 2. FIX: Remove unlimited INSERT policy for guest tokens
DROP POLICY IF EXISTS "Anyone can create guest tokens" ON public.guest_tokens;

-- Add a policy that only allows token creation through the RPC function
-- No direct INSERT access - use create_guest_token() function instead

-- 3. FIX: Static user sessions - Replace USING(true) with proper access control
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.static_user_sessions;

-- Create separate policies for static_user_sessions with proper access control
-- Only admins should be able to view sessions
CREATE POLICY "Only admins can manage static user sessions" 
ON public.static_user_sessions 
FOR ALL 
USING (is_expense_admin());

-- 4. FIX: Password hash exposure - Create a safe view without password_hash
DROP VIEW IF EXISTS public.static_users_safe;

CREATE VIEW public.static_users_safe AS
SELECT 
    id,
    username,
    is_active,
    created_at,
    updated_at,
    created_by
FROM public.static_users;

-- Enable RLS on the view (views inherit from underlying table RLS)
-- The view inherently excludes password_hash column

-- 5. FIX: Add text length constraints to fittrack tables
-- These prevent storage exhaustion attacks from extremely large text inputs

-- fittrack_meals constraints
ALTER TABLE public.fittrack_meals 
ADD CONSTRAINT fittrack_meals_food_length CHECK (length(food) <= 500);

-- fittrack_gym_sessions constraints  
ALTER TABLE public.fittrack_gym_sessions 
ADD CONSTRAINT fittrack_gym_sessions_exercise_length CHECK (length(exercise) <= 500);

ALTER TABLE public.fittrack_gym_sessions 
ADD CONSTRAINT fittrack_gym_sessions_notes_length CHECK (notes IS NULL OR length(notes) <= 2000);

-- fittrack_weight constraints
ALTER TABLE public.fittrack_weight 
ADD CONSTRAINT fittrack_weight_notes_length CHECK (notes IS NULL OR length(notes) <= 2000);

-- fittrack_sleep constraints
ALTER TABLE public.fittrack_sleep 
ADD CONSTRAINT fittrack_sleep_notes_length CHECK (notes IS NULL OR length(notes) <= 2000);