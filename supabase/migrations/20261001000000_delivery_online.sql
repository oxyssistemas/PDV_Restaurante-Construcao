-- Delivery próprio (loja online), origem dos pedidos e robô de WhatsApp por restaurante.
--
-- Origem do pedido (orders.source): internal (equipe), pos, qr (mesa), site (loja online),
-- whatsapp, ifood, 99food, keeta, rappi, other_app.

-- ---------- quem cuida do delivery ----------
CREATE OR REPLACE FUNCTION public.is_delivery_staff(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role((SELECT auth.uid()), 'super_admin')
      OR ((public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'delivery'))
          AND public.user_belongs_to_restaurant((SELECT auth.uid()), _restaurant_id)
          AND public.is_restaurant_active(_restaurant_id))
$$;
REVOKE EXECUTE ON FUNCTION public.is_delivery_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_delivery_staff(uuid) TO authenticated, service_role;

-- ---------- pedidos ----------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_token uuid,
  ADD COLUMN IF NOT EXISTS payment_hint text,
  ADD COLUMN IF NOT EXISTS change_for numeric;
CREATE INDEX IF NOT EXISTS orders_restaurant_phone_idx ON public.orders (restaurant_id, customer_phone) WHERE customer_phone IS NOT NULL;

-- ---------- loja online ----------
CREATE TABLE IF NOT EXISTS public.delivery_stores (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  enabled boolean NOT NULL DEFAULT false,          -- loja publicada
  is_open boolean NOT NULL DEFAULT true,           -- recebendo pedidos agora
  delivery_enabled boolean NOT NULL DEFAULT true,
  pickup_enabled boolean NOT NULL DEFAULT true,
  min_order numeric NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  default_fee numeric NOT NULL DEFAULT 0 CHECK (default_fee >= 0),
  zones jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{ "name": "Centro", "fee": 5 }]; vazio = taxa padrão
  eta_minutes integer NOT NULL DEFAULT 45 CHECK (eta_minutes BETWEEN 5 AND 300),
  pickup_eta_minutes integer NOT NULL DEFAULT 20 CHECK (pickup_eta_minutes BETWEEN 5 AND 300),
  payment_methods text[] NOT NULL DEFAULT '{cash,credit_card,debit_card,pix}',
  whatsapp text,
  address text,
  hours_text text,
  notice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_stores_zones_array CHECK (jsonb_typeof(zones) = 'array')
);
ALTER TABLE public.delivery_stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery staff manage store" ON public.delivery_stores;
CREATE POLICY "delivery staff manage store" ON public.delivery_stores FOR ALL TO authenticated
  USING (public.is_delivery_staff(restaurant_id)) WITH CHECK (public.is_delivery_staff(restaurant_id));
DROP TRIGGER IF EXISTS delivery_stores_updated_at ON public.delivery_stores;
CREATE TRIGGER delivery_stores_updated_at BEFORE UPDATE ON public.delivery_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- robô de WhatsApp ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  greeting text NOT NULL DEFAULT 'Olá! 👋 Seja bem-vindo(a) ao {restaurante}.',
  closed_message text NOT NULL DEFAULT 'No momento estamos fechados. Assim que abrirmos, é só pedir pelo link!',
  notify_status boolean NOT NULL DEFAULT true,
  human_pause_minutes integer NOT NULL DEFAULT 60 CHECK (human_pause_minutes BETWEEN 5 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_bot_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery staff manage bot" ON public.whatsapp_bot_settings;
CREATE POLICY "delivery staff manage bot" ON public.whatsapp_bot_settings FOR ALL TO authenticated
  USING (public.is_delivery_staff(restaurant_id)) WITH CHECK (public.is_delivery_staff(restaurant_id));
DROP TRIGGER IF EXISTS whatsapp_bot_settings_updated_at ON public.whatsapp_bot_settings;
CREATE TRIGGER whatsapp_bot_settings_updated_at BEFORE UPDATE ON public.whatsapp_bot_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS needs_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_bot_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS whatsapp_conversations_last_order_idx ON public.whatsapp_conversations (last_order_id);

-- Atendimento pelo portal Delivery (além do marketing): ler e marcar como lido.
DROP POLICY IF EXISTS "delivery view whatsapp_conversations" ON public.whatsapp_conversations;
CREATE POLICY "delivery view whatsapp_conversations" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.is_delivery_staff(restaurant_id));
DROP POLICY IF EXISTS "delivery update whatsapp_conversations" ON public.whatsapp_conversations;
CREATE POLICY "delivery update whatsapp_conversations" ON public.whatsapp_conversations FOR UPDATE TO authenticated
  USING (public.is_delivery_staff(restaurant_id)) WITH CHECK (public.is_delivery_staff(restaurant_id));
DROP POLICY IF EXISTS "delivery view whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "delivery view whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_delivery_staff(restaurant_id));

-- ---------- pedido feito pela loja online / link do WhatsApp ----------
-- Chamado só pela função delivery-store (service role). Preço, taxa e total são calculados aqui.
CREATE OR REPLACE FUNCTION public.create_online_order(_slug text, _order jsonb)
RETURNS TABLE (order_id uuid, public_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store public.delivery_stores%ROWTYPE;
  v_mode text := COALESCE(_order->>'mode', 'delivery');
  v_channel text := CASE WHEN _order->>'channel' = 'whatsapp' THEN 'whatsapp' ELSE 'site' END;
  v_name text := btrim(COALESCE(_order->>'name', ''));
  v_phone text := regexp_replace(COALESCE(_order->>'phone', ''), '\D', '', 'g');
  v_address text := NULLIF(btrim(COALESCE(_order->>'address', '')), '');
  v_zone text := NULLIF(btrim(COALESCE(_order->>'zone', '')), '');
  v_payment text := COALESCE(_order->>'payment', '');
  v_change numeric;
  v_fee numeric := 0;
  v_item jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_qty integer;
  v_subtotal numeric := 0;
  v_order uuid;
  v_token uuid := gen_random_uuid();
  v_customer uuid;
BEGIN
  SELECT s.* INTO v_store FROM public.delivery_stores s
    JOIN public.restaurants r ON r.id = s.restaurant_id
   WHERE s.slug = lower(_slug) AND s.enabled AND r.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada.'; END IF;
  IF NOT v_store.is_open THEN RAISE EXCEPTION 'A loja está fechada no momento.'; END IF;

  IF length(v_name) < 2 OR length(v_name) > 80 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 13 THEN RAISE EXCEPTION 'Informe um telefone com DDD.'; END IF;
  IF length(v_phone) <= 11 THEN v_phone := '55' || v_phone; END IF;
  IF v_payment <> ALL (v_store.payment_methods) THEN RAISE EXCEPTION 'Escolha a forma de pagamento.'; END IF;
  IF v_payment = 'cash' AND COALESCE(_order->>'change_for', '') <> '' THEN
    BEGIN v_change := (_order->>'change_for')::numeric; EXCEPTION WHEN OTHERS THEN v_change := NULL; END;
  END IF;

  IF v_mode = 'delivery' THEN
    IF NOT v_store.delivery_enabled THEN RAISE EXCEPTION 'A loja não está fazendo entregas agora.'; END IF;
    IF v_address IS NULL OR length(v_address) < 5 OR length(v_address) > 300 THEN RAISE EXCEPTION 'Informe o endereço de entrega.'; END IF;
    IF jsonb_array_length(v_store.zones) > 0 THEN
      SELECT (z->>'fee')::numeric INTO v_fee FROM jsonb_array_elements(v_store.zones) z WHERE z->>'name' = v_zone LIMIT 1;
      IF v_fee IS NULL THEN RAISE EXCEPTION 'Não entregamos nesse bairro.'; END IF;
      v_address := v_address || ' — ' || v_zone;
    ELSE
      v_fee := v_store.default_fee;
    END IF;
  ELSIF v_mode = 'pickup' THEN
    IF NOT v_store.pickup_enabled THEN RAISE EXCEPTION 'A loja não está aceitando retirada agora.'; END IF;
    v_address := NULL;
  ELSE
    RAISE EXCEPTION 'Escolha entrega ou retirada.';
  END IF;

  IF jsonb_typeof(_order->'items') <> 'array' OR jsonb_array_length(_order->'items') NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'O pedido deve ter entre 1 e 40 itens.';
  END IF;

  -- Proteção contra envios repetidos do mesmo telefone.
  IF (SELECT count(*) FROM public.orders o WHERE o.restaurant_id = v_store.restaurant_id
        AND o.customer_phone = v_phone AND o.created_at > now() - interval '10 minutes') >= 4 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.';
  END IF;

  INSERT INTO public.orders (restaurant_id, status, total, customer_name, customer_phone, customer_address,
    delivery_fee, delivery_status, order_type, source, notes, created_by_name, created_by_role,
    public_token, payment_hint, change_for)
  VALUES (v_store.restaurant_id, 'pending', 0, v_name, v_phone, v_address,
    v_fee, 'pending', CASE WHEN v_mode = 'pickup' THEN 'takeaway' ELSE 'delivery' END, v_channel,
    NULLIF(left(btrim(COALESCE(_order->>'notes', '')), 500), ''),
    CASE WHEN v_channel = 'whatsapp' THEN 'Cliente via WhatsApp' ELSE 'Cliente via loja online' END, 'customer',
    v_token, v_payment, v_change)
  RETURNING id INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_order->'items') LOOP
    BEGIN v_qty := (v_item->>'quantity')::integer; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Quantidade inválida.'; END;
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Cada item deve ter quantidade entre 1 e 50.'; END IF;
    SELECT * INTO v_menu FROM public.menu_items mi
     WHERE mi.id = (v_item->>'menu_item_id')::uuid AND mi.restaurant_id = v_store.restaurant_id AND mi.available;
    IF NOT FOUND THEN RAISE EXCEPTION 'Um produto escolhido não está mais disponível.'; END IF;
    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)
    VALUES (v_order, v_menu.id, v_qty, v_menu.price, NULLIF(left(btrim(COALESCE(v_item->>'notes', '')), 300), ''), 'pending');
    v_subtotal := v_subtotal + v_menu.price * v_qty;
  END LOOP;

  IF v_subtotal < v_store.min_order THEN
    RAISE EXCEPTION 'O pedido mínimo é de R$ %.', replace(to_char(v_store.min_order, 'FM999990.00'), '.', ',');
  END IF;
  UPDATE public.orders SET total = v_subtotal WHERE id = v_order;

  -- Cliente no CRM (por telefone).
  SELECT c.id INTO v_customer FROM public.customers c
   WHERE c.restaurant_id = v_store.restaurant_id AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8)
   LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers (restaurant_id, name, phone, address)
    VALUES (v_store.restaurant_id, v_name, v_phone, v_address);
  ELSIF v_address IS NOT NULL THEN
    UPDATE public.customers SET address = v_address WHERE id = v_customer;
  END IF;

  RETURN QUERY SELECT v_order, v_token;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_online_order(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_order(text, jsonb) TO service_role;

-- ---------- avisos de status pelo WhatsApp ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'whatsapp_bot_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'whatsapp_bot_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_bot_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'whatsapp_bot_secret'
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_bot_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_bot_secret() TO service_role;

-- Pedido novo ou mudança de status → robô avisa o cliente (sai depois do commit).
CREATE OR REPLACE FUNCTION public.notify_order_whatsapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_phone IS NULL OR NEW.order_type NOT IN ('delivery', 'takeaway') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_bot_settings b WHERE b.restaurant_id = NEW.restaurant_id AND b.enabled AND b.notify_status) THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/whatsapp-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', public.whatsapp_bot_secret()),
    body := jsonb_build_object('event', CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'status' END, 'order_id', NEW.id)
  );
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_order_whatsapp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_notify_whatsapp ON public.orders;
CREATE TRIGGER orders_notify_whatsapp AFTER INSERT OR UPDATE OF delivery_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_whatsapp();
