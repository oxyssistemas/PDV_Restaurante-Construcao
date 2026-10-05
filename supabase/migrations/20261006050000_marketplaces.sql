-- 99Food, Keeta e Rappi: pedidos dos apps entram sozinhos (webhook), como os do iFood.
-- Credenciais de integrador ficam como segredos da plataforma; cada loja informa o id dela em cada app.

CREATE TABLE IF NOT EXISTS public.marketplace_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('99food', 'keeta', 'rappi')),
  enabled boolean NOT NULL DEFAULT false,
  store_ref text CHECK (char_length(store_ref) <= 80),          -- id da loja no app
  webhook_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- vai no endereço do webhook
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, channel)
);
ALTER TABLE public.marketplace_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_integrations_read ON public.marketplace_integrations;
CREATE POLICY marketplace_integrations_read ON public.marketplace_integrations FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())));
DROP POLICY IF EXISTS marketplace_integrations_manage ON public.marketplace_integrations;
CREATE POLICY marketplace_integrations_manage ON public.marketplace_integrations FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));
DROP TRIGGER IF EXISTS update_marketplace_integrations_updated_at ON public.marketplace_integrations;
CREATE TRIGGER update_marketplace_integrations_updated_at BEFORE UPDATE ON public.marketplace_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_id text NOT NULL,
  display_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  customer_name text,
  total numeric(12,2),
  unmatched_items jsonb NOT NULL DEFAULT '[]',
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS marketplace_orders_restaurant ON public.marketplace_orders (restaurant_id, created_at DESC);
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_orders_read ON public.marketplace_orders;
CREATE POLICY marketplace_orders_read ON public.marketplace_orders FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));

-- Código do produto em cada app (ex.: {"rappi": "123", "99food": "abc"}) para casar os itens do pedido.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS external_codes jsonb NOT NULL DEFAULT '{}';

-- Cria o pedido a partir do formato normalizado:
-- { external_id, display_id, type: delivery|takeaway, customer: {name, phone}, address, notes, delivery_fee, total,
--   payment: {method, prepaid}, items: [{code, name, quantity, unit_price, notes}] }
CREATE OR REPLACE FUNCTION public.create_marketplace_order(_integration uuid, _o jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mi public.marketplace_integrations%ROWTYPE;
  v_order uuid;
  v_item jsonb;
  v_menu uuid;
  v_qty integer;
  v_price numeric;
  v_items_total numeric := 0;
  v_unmatched jsonb := '[]';
  v_notes text := NULLIF(left(btrim(COALESCE(_o ->> 'notes', '')), 500), '');
  v_ext text := NULLIF(btrim(COALESCE(_o ->> 'external_id', '')), '');
  v_label text;
BEGIN
  SELECT * INTO mi FROM public.marketplace_integrations WHERE id = _integration AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'Integração desativada'; END IF;
  IF v_ext IS NULL THEN RAISE EXCEPTION 'Pedido sem identificador'; END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_orders WHERE channel = mi.channel AND external_id = v_ext) THEN
    RETURN (SELECT order_id FROM public.marketplace_orders WHERE channel = mi.channel AND external_id = v_ext);
  END IF;
  v_label := CASE mi.channel WHEN '99food' THEN '99Food' WHEN 'keeta' THEN 'Keeta' ELSE 'Rappi' END;

  INSERT INTO public.orders (restaurant_id, status, total, customer_name, customer_phone, customer_address, delivery_fee,
                             created_by_name, created_by_role, order_type, source, delivery_status, payment_hint, notes)
  VALUES (mi.restaurant_id, 'pending', 0,
          NULLIF(left(btrim(COALESCE(_o #>> '{customer,name}', '')), 80), ''),
          NULLIF(left(btrim(COALESCE(_o #>> '{customer,phone}', '')), 20), ''),
          NULLIF(left(btrim(COALESCE(_o ->> 'address', '')), 300), ''),
          GREATEST(COALESCE(NULLIF(_o ->> 'delivery_fee', '')::numeric, 0), 0),
          v_label || COALESCE(' #' || NULLIF(_o ->> 'display_id', ''), ''), 'customer',
          CASE WHEN _o ->> 'type' = 'takeaway' THEN 'takeaway' ELSE 'delivery' END,
          mi.channel, 'pending',
          CASE WHEN COALESCE((_o #>> '{payment,prepaid}')::boolean, true) THEN 'app' ELSE NULLIF(_o #>> '{payment,method}', '') END,
          v_notes)
  RETURNING id INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(_o -> 'items', '[]')) LOOP
    v_qty := GREATEST(COALESCE(NULLIF(v_item ->> 'quantity', '')::numeric, 1)::integer, 1);
    v_price := GREATEST(COALESCE(NULLIF(v_item ->> 'unit_price', '')::numeric, 0), 0);
    SELECT m.id INTO v_menu FROM public.menu_items m
     WHERE m.restaurant_id = mi.restaurant_id
       AND ((NULLIF(v_item ->> 'code', '') IS NOT NULL AND m.external_codes ->> mi.channel = v_item ->> 'code')
            OR lower(btrim(m.name)) = lower(btrim(COALESCE(v_item ->> 'name', ''))))
     ORDER BY (m.external_codes ->> mi.channel = v_item ->> 'code') DESC NULLS LAST
     LIMIT 1;
    IF v_menu IS NULL THEN
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('name', v_item ->> 'name', 'code', v_item ->> 'code', 'quantity', v_qty, 'unit_price', v_price));
    ELSE
      INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)
      VALUES (v_order, v_menu, v_qty, v_price, NULLIF(left(btrim(COALESCE(v_item ->> 'notes', '')), 300), ''), 'pending');
    END IF;
    v_items_total := v_items_total + v_qty * v_price;
  END LOOP;

  -- itens sem vínculo no cardápio ficam nas observações (a cozinha vê) e geram aviso
  IF jsonb_array_length(v_unmatched) > 0 THEN
    UPDATE public.orders SET notes = concat_ws(' | ', notes, 'Itens do app sem vínculo: ' ||
      (SELECT string_agg((x ->> 'quantity') || 'x ' || COALESCE(x ->> 'name', x ->> 'code', 'item'), ', ') FROM jsonb_array_elements(v_unmatched) x))
     WHERE id = v_order;
    INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
    VALUES (mi.restaurant_id, v_label || ': item sem vínculo',
            'Um pedido do ' || v_label || ' tem itens que não estão no cardápio. Confira as observações do pedido e cadastre o código do produto.',
            'marketplace', ARRAY['admin', 'cashier', 'delivery']);
  END IF;

  UPDATE public.orders SET total = COALESCE(NULLIF(_o ->> 'total', '')::numeric - GREATEST(COALESCE(NULLIF(_o ->> 'delivery_fee', '')::numeric, 0), 0), v_items_total)
   WHERE id = v_order;
  INSERT INTO public.marketplace_orders (restaurant_id, channel, external_id, display_id, order_id, customer_name, total, unmatched_items, payload)
  VALUES (mi.restaurant_id, mi.channel, v_ext, NULLIF(_o ->> 'display_id', ''), v_order, _o #>> '{customer,name}',
          NULLIF(_o ->> 'total', '')::numeric, v_unmatched, _o);
  UPDATE public.marketplace_integrations SET last_event_at = now(), last_error = NULL WHERE id = mi.id;
  RETURN v_order;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_marketplace_order(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(uuid, jsonb) TO service_role;
