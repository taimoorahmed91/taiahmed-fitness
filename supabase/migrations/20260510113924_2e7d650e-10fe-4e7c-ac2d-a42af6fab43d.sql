-- Replace broad ALL policy with per-action policies that exclude SELECT
DROP POLICY IF EXISTS "Admins can manage all static users" ON public.static_users;

CREATE POLICY "Admins can insert static users"
ON public.static_users
FOR INSERT
TO authenticated
WITH CHECK (is_expense_admin());

CREATE POLICY "Admins can update static users"
ON public.static_users
FOR UPDATE
TO authenticated
USING (is_expense_admin())
WITH CHECK (is_expense_admin());

CREATE POLICY "Admins can delete static users"
ON public.static_users
FOR DELETE
TO authenticated
USING (is_expense_admin());

-- Defense-in-depth: revoke direct column access to password_hash
REVOKE SELECT (password_hash) ON public.static_users FROM authenticated;
REVOKE SELECT (password_hash) ON public.static_users FROM anon;