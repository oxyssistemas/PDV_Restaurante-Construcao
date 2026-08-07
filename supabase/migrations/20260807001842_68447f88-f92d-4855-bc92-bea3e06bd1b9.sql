CREATE POLICY "Couriers can update their assigned orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'courier')
  AND public.is_restaurant_active(restaurant_id)
  AND courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'courier')
  AND public.is_restaurant_active(restaurant_id)
  AND courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid())
);