-- Allow admins to update their own restaurant
CREATE POLICY "Admins can update their own restaurant"
ON public.restaurants
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND user_belongs_to_restaurant(auth.uid(), id)
  AND status = 'active'::restaurant_status
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND user_belongs_to_restaurant(auth.uid(), id)
  AND status = 'active'::restaurant_status
);