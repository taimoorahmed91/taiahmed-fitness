DROP POLICY IF EXISTS "Anyone can view coffee items" ON public.coffee_items;
DROP POLICY IF EXISTS "Anyone can view coffee recipes" ON public.coffee_recipes;
DROP POLICY IF EXISTS "Anyone can view expense categories" ON public.expense_categories;
CREATE POLICY "Signed-in users can view coffee items" ON public.coffee_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed-in users can view coffee recipes" ON public.coffee_recipes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed-in users can view expense categories" ON public.expense_categories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.coffee_items, public.coffee_recipes, public.expense_categories FROM anon;