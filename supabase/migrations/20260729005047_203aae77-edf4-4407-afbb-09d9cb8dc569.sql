DROP POLICY IF EXISTS "Waiters can update table status" ON public.restaurant_tables;

CREATE POLICY "Waiters can update table status" ON public.restaurant_tables FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'waiter') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'waiter') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id) AND status <> 'free'
);

CREATE POLICY "Cashiers can update table status" ON public.restaurant_tables FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'cashier') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'cashier') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);