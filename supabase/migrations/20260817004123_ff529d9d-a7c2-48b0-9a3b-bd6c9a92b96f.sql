
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS kitchen_session_id uuid;

CREATE TABLE IF NOT EXISTS public.kitchen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  closed_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  orders_archived integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.kitchen_sessions TO authenticated;
GRANT ALL ON public.kitchen_sessions TO service_role;

ALTER TABLE public.kitchen_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restaurant users can view kitchen sessions" ON public.kitchen_sessions;
CREATE POLICY "Restaurant users can view kitchen sessions"
ON public.kitchen_sessions FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));

DROP POLICY IF EXISTS "Kitchen and admins can open sessions" ON public.kitchen_sessions;
CREATE POLICY "Kitchen and admins can open sessions"
ON public.kitchen_sessions FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'kitchen'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
);

DROP POLICY IF EXISTS "Kitchen and admins can close sessions" ON public.kitchen_sessions;
CREATE POLICY "Kitchen and admins can close sessions"
ON public.kitchen_sessions FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'kitchen'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'kitchen'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
);

DROP POLICY IF EXISTS "Delivery staff can register payments" ON public.payments;
CREATE POLICY "Delivery staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'delivery'::app_role)
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
);

DROP POLICY IF EXISTS "Delivery staff can view payments" ON public.payments;
CREATE POLICY "Delivery staff can view payments"
ON public.payments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'delivery'::app_role)
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
);

DROP POLICY IF EXISTS "Waiters can view payments" ON public.payments;
CREATE POLICY "Waiters can view payments"
ON public.payments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'waiter'::app_role)
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON public.orders(restaurant_id, archived_at);
