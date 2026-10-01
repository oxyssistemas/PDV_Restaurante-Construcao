-- Conta do cliente da loja online: cadastro/login para pedir, dados no CRM de cada loja e "Meus pedidos".
-- O cliente é um usuário do Auth sem papel (user_roles); a sessão da loja fica separada da equipe no navegador.

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  phone text NOT NULL CHECK (phone ~ '^\d{12,13}$'),
  address text,
  complement text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own customer profile" ON public.customer_profiles;
CREATE POLICY "own customer profile" ON public.customer_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP TRIGGER IF EXISTS customer_profiles_updated_at ON public.customer_profiles;
CREATE TRIGGER customer_profiles_updated_at BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ficha no CRM de cada restaurante ligada à conta.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_user_key ON public.customers (restaurant_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_user_idx ON public.customers (user_id);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_customer_user_idx ON public.orders (customer_user_id, restaurant_id, created_at DESC) WHERE customer_user_id IS NOT NULL;

-- Cria/atualiza a ficha do cliente no CRM do restaurante (por conta; senão pelo telefone).
CREATE OR REPLACE FUNCTION public.link_store_customer(_restaurant_id uuid, _user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile public.customer_profiles%ROWTYPE;
  v_email text;
  v_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.customer_profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = _user_id;

  SELECT id INTO v_id FROM public.customers WHERE restaurant_id = _restaurant_id AND user_id = _user_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.customers
     WHERE restaurant_id = _restaurant_id AND user_id IS NULL
       AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = right(v_profile.phone, 8)
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.customers (restaurant_id, user_id, name, phone, email, address, tags)
    VALUES (_restaurant_id, _user_id, v_profile.name, v_profile.phone, v_email,
            NULLIF(concat_ws(' · ', v_profile.address, v_profile.complement), ''), ARRAY['loja online'])
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customers SET
      user_id = _user_id, name = v_profile.name, phone = v_profile.phone, email = COALESCE(v_email, email),
      address = COALESCE(NULLIF(concat_ws(' · ', v_profile.address, v_profile.complement), ''), address),
      tags = CASE WHEN 'loja online' = ANY(tags) THEN tags ELSE array_append(tags, 'loja online') END
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.link_store_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_store_customer(uuid, uuid) TO service_role;

-- Pedido da loja online agora exige a conta do cliente.
DROP FUNCTION IF EXISTS public.create_online_order(text, jsonb);
CREATE OR REPLACE FUNCTION public.create_online_order(_slug text, _order jsonb, _user_id uuid)
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
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para fazer o pedido.'; END IF;

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

  -- Proteção contra envios repetidos da mesma conta/telefone.
  IF (SELECT count(*) FROM public.orders o WHERE o.restaurant_id = v_store.restaurant_id
        AND (o.customer_user_id = _user_id OR o.customer_phone = v_phone) AND o.created_at > now() - interval '10 minutes') >= 4 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.';
  END IF;

  INSERT INTO public.orders (restaurant_id, status, total, customer_name, customer_phone, customer_address,
    delivery_fee, delivery_status, order_type, source, notes, created_by_name, created_by_role,
    public_token, payment_hint, change_for, customer_user_id)
  VALUES (v_store.restaurant_id, 'pending', 0, v_name, v_phone, v_address,
    v_fee, 'pending', CASE WHEN v_mode = 'pickup' THEN 'takeaway' ELSE 'delivery' END, v_channel,
    NULLIF(left(btrim(COALESCE(_order->>'notes', '')), 500), ''),
    CASE WHEN v_channel = 'whatsapp' THEN 'Cliente via WhatsApp' ELSE 'Cliente via loja online' END, 'customer',
    v_token, v_payment, v_change, _user_id)
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

  -- Conta e CRM: guarda o último endereço/telefone e atualiza a ficha da loja.
  INSERT INTO public.customer_profiles AS cp (user_id, name, phone, address, complement)
  VALUES (_user_id, v_name, v_phone,
    CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'address_line', '')), '') END,
    CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'complement', '')), '') END)
  ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone,
    address = CASE WHEN v_mode = 'delivery' THEN EXCLUDED.address ELSE cp.address END,
    complement = CASE WHEN v_mode = 'delivery' THEN EXCLUDED.complement ELSE cp.complement END;
  PERFORM public.link_store_customer(v_store.restaurant_id, _user_id);

  RETURN QUERY SELECT v_order, v_token;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_online_order(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_order(text, jsonb, uuid) TO service_role;
