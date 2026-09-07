CREATE TABLE public.ifood_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  merchant_id text,
  enabled boolean NOT NULL DEFAULT false,
  auto_accept boolean NOT NULL DEFAULT false,
  sync_catalog boolean NOT NULL DEFAULT true,
  sync_store_status boolean NOT NULL DEFAULT true,
  store_open boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ifood_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  ifood_order_id text NOT NULL,
  display_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'pending',
  ifood_status text,
  customer_name text,
  customer_phone text,
  customer_address text,
  total numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ifood_orders_decision_check CHECK (decision IN ('pending','accepted','rejected','cancelled')),
  CONSTRAINT ifood_orders_unique UNIQUE (restaurant_id, ifood_order_id)
);

CREATE TABLE public.ifood_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  code text,
  ifood_order_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ifood_events_unique UNIQUE (restaurant_id, event_id)
);

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS ifood_product_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal';

CREATE INDEX ifood_orders_restaurant_idx ON public.ifood_orders (restaurant_id, decision, created_at DESC);
CREATE INDEX ifood_events_restaurant_idx ON public.ifood_events (restaurant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ifood_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ifood_orders TO authenticated;
GRANT SELECT ON public.ifood_events TO authenticated;
GRANT ALL ON public.ifood_integrations TO service_role;
GRANT ALL ON public.ifood_orders TO service_role;
GRANT ALL ON public.ifood_events TO service_role;

ALTER TABLE public.ifood_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ifood_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ifood_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ifood_integrations_select" ON public.ifood_integrations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_integrations.restaurant_id));

CREATE POLICY "ifood_integrations_manage" ON public.ifood_integrations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_integrations.restaurant_id AND ur.role = 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_integrations.restaurant_id AND ur.role = 'admin'));

CREATE POLICY "ifood_orders_select" ON public.ifood_orders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_orders.restaurant_id));

CREATE POLICY "ifood_orders_update" ON public.ifood_orders FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_orders.restaurant_id
    AND ur.role IN ('admin','cashier','delivery','kitchen')))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_orders.restaurant_id
    AND ur.role IN ('admin','cashier','delivery','kitchen')));

CREATE POLICY "ifood_events_select" ON public.ifood_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.restaurant_id = ifood_events.restaurant_id AND ur.role = 'admin'));

CREATE TRIGGER ifood_integrations_updated BEFORE UPDATE ON public.ifood_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ifood_orders_updated BEFORE UPDATE ON public.ifood_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();