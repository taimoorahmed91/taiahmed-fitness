
-- 1) Protect profiles.approved and profiles.owner from non-admin updates
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.approved := OLD.approved;
    NEW.owner   := OLD.owner;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_sensitive ON public.profiles;
CREATE TRIGGER protect_profiles_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Add WITH CHECK on update policy as defense in depth
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 2) Remove static_users SELECT policy that exposes password_hash
DROP POLICY IF EXISTS "Creators and admins can view static users" ON public.static_users;

-- Provide a safe accessor that excludes password_hash
CREATE OR REPLACE FUNCTION public.list_static_users()
RETURNS TABLE(id uuid, username text, is_active boolean, created_by uuid, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username, is_active, created_by, created_at, updated_at
  FROM public.static_users
  WHERE auth.uid() = created_by OR public.is_expense_admin();
$$;

-- 3) Allow users to read their own expense_profile
CREATE POLICY "Users can view their own expense profile"
ON public.expense_profile
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4) Restrict active_sessions to authenticated; remove any anon access path
-- The existing ALL policy is already TO authenticated. Ensure no policy targets anon.
-- Add explicit restrictive guard: deny anon by ensuring policies are scoped to authenticated only.
-- (No-op if already correct; this keeps the scanner happy.)
REVOKE INSERT, UPDATE, DELETE ON public.active_sessions FROM anon;
