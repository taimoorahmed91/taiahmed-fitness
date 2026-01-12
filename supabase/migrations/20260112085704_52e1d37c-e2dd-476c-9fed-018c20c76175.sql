-- Fix the SECURITY DEFINER view issue
-- Drop and recreate the view with SECURITY INVOKER (the default, explicit for clarity)
DROP VIEW IF EXISTS public.static_users_safe;

CREATE VIEW public.static_users_safe 
WITH (security_invoker = true)
AS
SELECT 
    id,
    username,
    is_active,
    created_at,
    updated_at,
    created_by
FROM public.static_users;