
-- 1. Fix get_or_create_daily_summary: enforce caller matches p_user_id
CREATE OR REPLACE FUNCTION public.get_or_create_daily_summary(p_user_id uuid)
 RETURNS fittrack_daily_summary
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_summary fittrack_daily_summary;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_calorie_goal INTEGER;
  v_calories_consumed INTEGER;
  v_workout_yesterday BOOLEAN;
  v_workout_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT daily_calorie_goal INTO v_calorie_goal
  FROM fittrack_user_settings WHERE user_id = p_user_id;
  v_calorie_goal := COALESCE(v_calorie_goal, 2000);

  SELECT COALESCE(SUM(calories), 0)::INTEGER INTO v_calories_consumed
  FROM fittrack_meals WHERE user_id = p_user_id AND date = v_today;

  SELECT EXISTS(SELECT 1 FROM fittrack_gym_sessions
    WHERE user_id = p_user_id AND date = v_yesterday) INTO v_workout_yesterday;

  v_workout_status := CASE WHEN v_workout_yesterday THEN 'no' ELSE 'yes' END;

  UPDATE fittrack_daily_summary
  SET date = v_today, calories_consumed = v_calories_consumed,
      calories_remaining = v_calorie_goal - v_calories_consumed,
      calorie_goal = v_calorie_goal, workout_status = v_workout_status, updated_at = NOW()
  WHERE user_id = p_user_id RETURNING * INTO v_summary;

  IF v_summary.id IS NULL THEN
    INSERT INTO fittrack_daily_summary (user_id, date, calories_consumed, calories_remaining,
      calorie_goal, workout_status, created_at, updated_at)
    VALUES (p_user_id, v_today, v_calories_consumed, v_calorie_goal - v_calories_consumed,
      v_calorie_goal, v_workout_status, NOW(), NOW())
    RETURNING * INTO v_summary;
  END IF;

  RETURN v_summary;
END;
$function$;

-- 2. active_sessions: replace overly-permissive policy
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.active_sessions;
CREATE POLICY "Authenticated users manage their own sessions"
  ON public.active_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. orders: remove anonymous guest enumeration
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. order_items: scope to authenticated owners
DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
CREATE POLICY "Users can view their own order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create order items for their orders" ON public.order_items;
CREATE POLICY "Users can create order items for their orders"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- 5. static_users: remove group-member SELECT; only creator + admins
DROP POLICY IF EXISTS "Users can view static users they created or are in same group" ON public.static_users;
CREATE POLICY "Creators and admins can view static users"
  ON public.static_users FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR is_expense_admin());

-- 6. archived_orders: allow original customer to view
CREATE POLICY "Users can view their own archived orders"
  ON public.archived_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 7. archived_order_items: allow via parent ownership
CREATE POLICY "Users can view their own archived order items"
  ON public.archived_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.archived_orders
    WHERE archived_orders.id = archived_order_items.archived_order_id
      AND archived_orders.user_id = auth.uid()));
