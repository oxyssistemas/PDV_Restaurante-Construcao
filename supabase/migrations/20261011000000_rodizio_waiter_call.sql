-- Rodízio e "chamar garçom".
-- Rodízio: o admin cria os rodízios (nome e preço por pessoa) e marca no cardápio quais pratos fazem parte.
-- O garçom coloca a mesa em rodízio: o QR/tablet da mesa passa a mostrar só os pratos do rodízio (sem cobrar),
-- e a cobrança é uma linha "Rodízio" por pessoa na comanda. Fora do rodízio, os mesmos pratos têm o preço normal.

CREATE TABLE IF NOT EXISTS public.rodizios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  description text,
  price_adult numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_adult >= 0),
  price_child numeric(10,2) CHECK (price_child >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  charge_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rodizios_restaurant_idx ON public.rodizios (restaurant_id);
ALTER TABLE public.rodizios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view rodizios" ON public.rodizios FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));
CREATE POLICY "Admins can manage rodizios" ON public.rodizios FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));
CREATE TRIGGER update_rodizios_updated_at BEFORE UPDATE ON public.rodizios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER offline_hub_notify AFTER INSERT OR DELETE OR UPDATE ON public.rodizios FOR EACH ROW EXECUTE FUNCTION notify_offline_hub_change();

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS rodizio_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_rodizio_charge boolean NOT NULL DEFAULT false;

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS rodizio_id uuid REFERENCES public.rodizios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rodizio_adults integer,
  ADD COLUMN IF NOT EXISTS rodizio_children integer,
  ADD COLUMN IF NOT EXISTS rodizio_started_at timestamptz;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;

-- a equipe da loja pode criar avisos (chamar gerente, pedir fechamento); antes só o admin conseguia
CREATE POLICY "Restaurant staff can create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));

-- item de cobrança do rodízio: um item "escondido" no cardápio (não aparece para pedir), com o preço por pessoa.
-- Assim a cobrança entra na comanda, no recibo, na NFC-e e nos relatórios como qualquer item.
CREATE OR REPLACE FUNCTION public.rodizio_sync_charge_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.charge_item_id IS NULL OR NOT EXISTS (SELECT 1 FROM menu_items WHERE id = NEW.charge_item_id) THEN
    INSERT INTO menu_items (restaurant_id, name, description, price, available, is_rodizio_charge)
    VALUES (NEW.restaurant_id, 'Rodízio ' || NEW.name, NEW.description, NEW.price_adult, false, true)
    RETURNING id INTO NEW.charge_item_id;
  ELSE
    UPDATE menu_items SET name = 'Rodízio ' || NEW.name, description = NEW.description, price = NEW.price_adult,
      available = false, is_rodizio_charge = true
    WHERE id = NEW.charge_item_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rodizios_sync_charge_item BEFORE INSERT OR UPDATE OF name, description, price_adult, charge_item_id
  ON public.rodizios FOR EACH ROW EXECUTE FUNCTION public.rodizio_sync_charge_item();

-- mesa liberada: sai do rodízio
CREATE OR REPLACE FUNCTION public.table_clear_rodizio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'free' AND OLD.status IS DISTINCT FROM 'free' THEN
    NEW.rodizio_id := NULL; NEW.rodizio_adults := NULL; NEW.rodizio_children := NULL; NEW.rodizio_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restaurant_tables_clear_rodizio BEFORE UPDATE OF status ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.table_clear_rodizio();

-- pedido pelo QR/tablet da mesa: com a mesa em rodízio, só os pratos do rodízio e sem cobrar
CREATE OR REPLACE FUNCTION public.create_qr_order(_qr_token uuid, _customer_name text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_table public.restaurant_tables%ROWTYPE;
  v_order_id uuid;
  v_item jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_quantity integer;
  v_price numeric;
  v_total numeric := 0;
  v_recent integer;
BEGIN
  IF _customer_name IS NULL OR length(btrim(_customer_name)) < 2 OR length(btrim(_customer_name)) > 80 THEN
    RAISE EXCEPTION 'Informe um nome entre 2 e 80 caracteres.';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 30 THEN
    RAISE EXCEPTION 'O pedido deve conter entre 1 e 30 itens.';
  END IF;

  SELECT rt.* INTO v_table
  FROM public.restaurant_tables rt JOIN public.restaurants r ON r.id = rt.restaurant_id
  WHERE rt.qr_token = _qr_token AND rt.qr_enabled = true AND r.status = 'active'
  FOR UPDATE OF rt;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR Code inválido ou pedidos desativados para esta mesa.'; END IF;

  SELECT count(*) INTO v_recent FROM public.orders o
  WHERE o.table_id = v_table.id AND o.source = 'qr' AND o.created_at > now() - interval '2 minutes';
  IF v_recent >= 5 THEN RAISE EXCEPTION 'Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos.'; END IF;

  INSERT INTO public.orders (restaurant_id, table_id, status, total, customer_name, created_by_name, created_by_role, order_type, source)
  VALUES (v_table.restaurant_id, v_table.id, 'pending', 0, btrim(_customer_name), 'Cliente via QR', 'customer', 'dine_in', 'qr')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    BEGIN v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Quantidade inválida.'; END;
    IF v_quantity < 1 OR v_quantity > 20 THEN RAISE EXCEPTION 'Cada item deve ter quantidade entre 1 e 20.'; END IF;

    SELECT * INTO v_menu FROM public.menu_items mi
    WHERE mi.id = (v_item ->> 'menu_item_id')::uuid AND mi.restaurant_id = v_table.restaurant_id AND mi.available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Um produto escolhido não está mais disponível.'; END IF;

    IF v_table.rodizio_id IS NOT NULL THEN
      IF NOT (v_table.rodizio_id = ANY(v_menu.rodizio_ids)) THEN
        RAISE EXCEPTION '"%" não faz parte do rodízio. Chame o garçom para pedir por fora.', v_menu.name;
      END IF;
      v_price := 0;
    ELSE
      v_price := v_menu.price;
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)
    VALUES (v_order_id, v_menu.id, v_quantity, v_price,
            NULLIF(left(btrim(COALESCE(v_item ->> 'notes', '')), 300), ''), 'pending');
    v_total := v_total + (v_price * v_quantity);
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;
  UPDATE public.restaurant_tables SET status = 'occupied' WHERE id = v_table.id;
  RETURN v_order_id;
END;
$function$;

-- central offline também recebe os rodízios
DO $$
DECLARE d text := pg_get_functiondef('public.offline_replica'::regproc);
BEGIN
  IF position('rodizios' in d) = 0 THEN
    d := replace(d, '''kiosks'', ''feedback_settings''];', '''kiosks'', ''feedback_settings'', ''rodizios''];');
    d := replace(d, '''feedback_settings'', (SELECT',
      '''rodizios'', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.rodizios t WHERE t.restaurant_id = _restaurant_id),' || chr(10) || '      ''feedback_settings'', (SELECT');
    EXECUTE d;
  END IF;
END $$;

-- cobrança do rodízio não vai para a cozinha
DO $$
DECLARE d text := pg_get_functiondef('public.enqueue_kitchen_print'::regproc);
BEGIN
  IF position('is_rodizio_charge' in d) = 0 THEN
    d := replace(d, '  IF public.is_offline_sync() THEN RETURN NEW; END IF;',
      '  IF public.is_offline_sync() THEN RETURN NEW; END IF;' || chr(10) ||
      '  -- cobrança do rodízio não vai para a cozinha' || chr(10) ||
      '  IF EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = NEW.menu_item_id AND m.is_rodizio_charge) THEN RETURN NEW; END IF;');
    EXECUTE d;
  END IF;
END $$;

-- mapa de mesas e comanda do garçom percebem na hora mesa liberada/rodízio
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'restaurant_tables') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
  END IF;
END $$;
