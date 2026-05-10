
-- 1. Remove broad admin access to static_user_sessions tokens
DROP POLICY IF EXISTS "Only admins can manage static user sessions" ON public.static_user_sessions;
-- RLS stays enabled with no policies => only SECURITY DEFINER functions can access

-- 2. Explicit deny for anon on active_sessions
REVOKE ALL ON public.active_sessions FROM anon;

-- 3. Explicit deny for anon on orders / order_items / archived equivalents
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.archived_orders FROM anon;
REVOKE ALL ON public.archived_order_items FROM anon;
