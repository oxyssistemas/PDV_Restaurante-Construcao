CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  vehicle text,
  plate text,
  status text NOT NULL DEFAULT 'free',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant staff can view couriers"
ON public.couriers FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins manage couriers"
ON public.couriers FOR ALL TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id))
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id))
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Courier updates own status"
ON public.couriers FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_couriers_updated_at
BEFORE UPDATE ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_couriers_restaurant ON public.couriers(restaurant_id);
CREATE UNIQUE INDEX idx_couriers_user ON public.couriers(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.orders ADD COLUMN courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_courier ON public.orders(courier_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;