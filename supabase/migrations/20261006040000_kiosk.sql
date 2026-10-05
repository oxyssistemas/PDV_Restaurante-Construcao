-- Autoatendimento (totem / tablet no balcão): o cliente faz o pedido sozinho e recebe uma senha.

CREATE TABLE IF NOT EXISTS public.kiosks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  eat_in_enabled boolean NOT NULL DEFAULT true,
  takeaway_enabled boolean NOT NULL DEFAULT true,
  ask_phone boolean NOT NULL DEFAULT true,
  welcome_text text CHECK (char_length(welcome_text) <= 120),
  idle_seconds integer NOT NULL DEFAULT 90 CHECK (idle_seconds BETWEEN 30 AND 600),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosks_restaurant ON public.kiosks (restaurant_id);
ALTER TABLE public.kiosks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kiosks_read ON public.kiosks;
CREATE POLICY kiosks_read ON public.kiosks FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
DROP POLICY IF EXISTS kiosks_manage ON public.kiosks;
CREATE POLICY kiosks_manage ON public.kiosks FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));
DROP TRIGGER IF EXISTS update_kiosks_updated_at ON public.kiosks;
CREATE TRIGGER update_kiosks_updated_at BEFORE UPDATE ON public.kiosks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Senha do pedido (recomeça todo dia, por loja).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ticket_number integer;

CREATE OR REPLACE FUNCTION public.create_kiosk_order(_token uuid, _order jsonb)
RETURNS TABLE (order_id uuid, ticket_number integer, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k public.kiosks%ROWTYPE;
  v_name text := btrim(COALESCE(_order ->> 'name', ''));
  v_phone text := public.norm_phone(_order ->> 'phone');
  v_mode text := COALESCE(_order ->> 'mode', 'takeaway');
  v_items jsonb := _order -> 'items';
  v_item jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_qty integer;
  v_total numeric := 0;
  v_order uuid;
  v_ticket integer;
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  SELECT kk.* INTO k FROM public.kiosks kk JOIN public.restaurants r ON r.id = kk.restaurant_id
   WHERE kk.token = _token AND kk.enabled AND r.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Este totem está desativado no momento.'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 40 THEN RAISE EXCEPTION 'Digite seu nome para chamarmos você.'; END IF;
  IF v_mode NOT IN ('eat_in', 'takeaway') OR (v_mode = 'eat_in' AND NOT k.eat_in_enabled) OR (v_mode = 'takeaway' AND NOT k.takeaway_enabled) THEN
    RAISE EXCEPTION 'Escolha se vai comer aqui ou levar.';
  END IF;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) < 1 OR jsonb_array_length(v_items) > 40 THEN
    RAISE EXCEPTION 'O pedido deve ter entre 1 e 40 itens.';
  END IF;
  IF (SELECT count(*) FROM public.orders o WHERE o.restaurant_id = k.restaurant_id AND o.source = 'kiosk'
        AND o.created_at > now() - interval '1 minute' AND o.created_by_name = 'Totem: ' || k.name) >= 6 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Aguarde um instante.';
  END IF;

  -- senha do dia (uma por vez por loja)
  PERFORM pg_advisory_xact_lock(hashtext('kiosk-ticket-' || k.restaurant_id::text));
  SELECT COALESCE(max(o.ticket_number), 0) + 1 INTO v_ticket FROM public.orders o
   WHERE o.restaurant_id = k.restaurant_id AND o.ticket_number IS NOT NULL AND o.created_at >= v_day_start;

  INSERT INTO public.orders (restaurant_id, status, total, customer_name, customer_phone, created_by_name, created_by_role,
                             order_type, source, delivery_status, payment_hint, notes, ticket_number)
  VALUES (k.restaurant_id, 'pending', 0, v_name, v_phone, 'Totem: ' || k.name, 'customer',
          'takeaway', 'kiosk', 'pending', 'counter',
          CASE WHEN v_mode = 'eat_in' THEN 'Comer no local' ELSE 'Para levar' END, v_ticket)
  RETURNING id INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    BEGIN v_qty := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Quantidade inválida.'; END;
    IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'Cada item deve ter quantidade entre 1 e 20.'; END IF;
    SELECT * INTO v_menu FROM public.menu_items mi
     WHERE mi.id = NULLIF(v_item ->> 'menu_item_id', '')::uuid AND mi.restaurant_id = k.restaurant_id AND mi.available;
    IF NOT FOUND THEN RAISE EXCEPTION 'Um produto escolhido acabou de ficar indisponível.'; END IF;
    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)
    VALUES (v_order, v_menu.id, v_qty, v_menu.price, NULLIF(left(btrim(COALESCE(v_item ->> 'notes', '')), 200), ''), 'pending');
    v_total := v_total + v_menu.price * v_qty;
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order;
  UPDATE public.kiosks SET last_seen_at = now() WHERE id = k.id;
  RETURN QUERY SELECT v_order, v_ticket, v_total;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_kiosk_order(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_kiosk_order(uuid, jsonb) TO service_role;
