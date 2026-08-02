-- order_items: add active-restaurant scope
DROP POLICY IF EXISTS "Staff can create order items" ON public.order_items;
CREATE POLICY "Staff can create order items" ON public.order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery') OR public.has_role(auth.uid(),'admin'))
    AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(o.restaurant_id)
));

DROP POLICY IF EXISTS "Staff can update order items" ON public.order_items;
CREATE POLICY "Staff can update order items" ON public.order_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'kitchen') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery') OR public.has_role(auth.uid(),'admin'))
    AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(o.restaurant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'kitchen') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery') OR public.has_role(auth.uid(),'admin'))
    AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(o.restaurant_id)
));

DROP POLICY IF EXISTS "Staff can delete order items" ON public.order_items;
CREATE POLICY "Staff can delete order items" ON public.order_items FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin'))
    AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(o.restaurant_id)
));

-- menu_item_ingredients / components: add active-restaurant scope
DROP POLICY IF EXISTS "Admins and finance manage ingredients" ON public.menu_item_ingredients;
CREATE POLICY "Admins and finance manage ingredients" ON public.menu_item_ingredients FOR ALL TO authenticated
USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id))
WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id));

DROP POLICY IF EXISTS "Admins and finance manage combo components" ON public.menu_item_components;
CREATE POLICY "Admins and finance manage combo components" ON public.menu_item_components FOR ALL TO authenticated
USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id))
WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id));

-- notifications: add active-restaurant scope
DROP POLICY IF EXISTS "Restaurant users can view notifications" ON public.notifications;
CREATE POLICY "Restaurant users can view notifications" ON public.notifications FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));

DROP POLICY IF EXISTS "Restaurant users can update notifications" ON public.notifications;
CREATE POLICY "Restaurant users can update notifications" ON public.notifications FOR UPDATE TO authenticated
USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id))
WITH CHECK (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));

DROP POLICY IF EXISTS "Restaurant admins can create notifications" ON public.notifications;
CREATE POLICY "Restaurant admins can create notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.has_role(auth.uid(),'admin') AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)));