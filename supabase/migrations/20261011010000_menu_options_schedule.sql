-- Opções do prato e horários por item.
-- Grupos de opções por prato: Tamanho (P/M/G, preço do tamanho), Sabores (meio a meio, 1/3, 1/4 — preço do
-- sabor mais caro ou a média, na proporção do tamanho) e Adicionais/montagem (mínimo e máximo, preço somado).
-- O preço final é sempre calculado no banco (menu_item_quote) nos pedidos do QR, totem e loja online.
-- Horários: o prato só aparece e só pode ser pedido nos dias e horários escolhidos (vazio = sempre).

CREATE TABLE IF NOT EXISTS public.menu_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  kind text NOT NULL DEFAULT 'extra' CHECK (kind IN ('size', 'flavor', 'extra')),
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1 AND max_select <= 20),
  pricing text NOT NULL DEFAULT 'sum' CHECK (pricing IN ('sum', 'max', 'avg')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_select <= max_select)
);
CREATE INDEX IF NOT EXISTS menu_option_groups_item_idx ON public.menu_option_groups (menu_item_id);
CREATE INDEX IF NOT EXISTS menu_option_groups_restaurant_idx ON public.menu_option_groups (restaurant_id);

CREATE TABLE IF NOT EXISTS public.menu_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.menu_option_groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  linked_item_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_options_group_idx ON public.menu_options (group_id);
CREATE INDEX IF NOT EXISTS menu_options_restaurant_idx ON public.menu_options (restaurant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_option_groups', 'menu_options'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Restaurant users can view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Admins can manage %1$s" ON public.%1$I FOR ALL TO authenticated
      USING (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
      WITH CHECK (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))$p$, t);
    EXECUTE format('CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
    EXECUTE format('CREATE TRIGGER offline_hub_notify AFTER INSERT OR DELETE OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION notify_offline_hub_change()', t);
  END LOOP;
END $$;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS available_days smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS available_from time,
  ADD COLUMN IF NOT EXISTS available_to time;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS options_text text;

-- o prato está no horário agora? (dias 0=domingo..6=sábado; faixa pode virar a meia-noite)
CREATE OR REPLACE FUNCTION public.menu_item_on_now(_days smallint[], _from time, _to time)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo') AS ts)
  SELECT (COALESCE(cardinality(_days), 0) = 0 OR extract(dow FROM n.ts)::smallint = ANY(_days))
     AND (_from IS NULL OR _to IS NULL OR _from = _to
          OR (_from < _to AND n.ts::time >= _from AND n.ts::time < _to)
          OR (_from > _to AND (n.ts::time >= _from OR n.ts::time < _to)))
  FROM n
$$;

-- preço e descrição das opções escolhidas (_options = lista de ids de menu_options)
CREATE OR REPLACE FUNCTION public.menu_item_quote(_item uuid, _options jsonb, OUT price numeric, OUT label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it public.menu_items%ROWTYPE;
  ids uuid[];
  g record;
  cnt integer;
  base numeric;
  ratio numeric := 1;
  extras numeric := 0;
  v_price numeric;
  v_name text;
  v_names text;
  v_max numeric;
  v_avg numeric;
  parts text[] := '{}';
BEGIN
  SELECT * INTO it FROM public.menu_items WHERE id = _item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Um produto escolhido não está mais disponível.'; END IF;
  base := it.price;
  BEGIN
    SELECT COALESCE(array_agg(DISTINCT value::uuid), '{}') INTO ids
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_options) = 'array' THEN _options ELSE '[]'::jsonb END);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Opção inválida em "%".', it.name;
  END;
  IF EXISTS (SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS (
      SELECT 1 FROM public.menu_options o JOIN public.menu_option_groups gg ON gg.id = o.group_id
       WHERE o.id = x AND gg.menu_item_id = _item AND o.available)) THEN
    RAISE EXCEPTION 'Uma opção escolhida para "%" não está mais disponível.', it.name;
  END IF;

  FOR g IN SELECT * FROM public.menu_option_groups WHERE menu_item_id = _item ORDER BY (kind <> 'size'), sort_order, created_at LOOP
    SELECT count(*) INTO cnt FROM public.menu_options o WHERE o.group_id = g.id AND o.id = ANY(ids);
    IF cnt < g.min_select THEN
      RAISE EXCEPTION '"%": escolha % em %.', it.name, CASE WHEN g.min_select = 1 THEN '1 opção' ELSE g.min_select || ' opções' END, g.name;
    END IF;
    IF cnt > g.max_select THEN
      RAISE EXCEPTION '"%": no máximo % em %.', it.name, g.max_select, g.name;
    END IF;
    CONTINUE WHEN cnt = 0;
    IF g.kind = 'size' THEN
      SELECT o.price, o.name INTO v_price, v_name FROM public.menu_options o WHERE o.group_id = g.id AND o.id = ANY(ids) LIMIT 1;
      ratio := CASE WHEN it.price > 0 THEN v_price / it.price ELSE 1 END;
      base := v_price;
      parts := parts || (g.name || ' ' || v_name);
    ELSIF g.kind = 'flavor' THEN
      SELECT max(o.price), avg(o.price),
             string_agg(CASE WHEN cnt > 1 THEN '1/' || cnt || ' ' ELSE '' END || o.name, ', ' ORDER BY o.sort_order, o.name)
        INTO v_max, v_avg, v_names
        FROM public.menu_options o WHERE o.group_id = g.id AND o.id = ANY(ids);
      base := round((CASE WHEN g.pricing = 'avg' THEN v_avg ELSE v_max END) * ratio, 2);
      parts := parts || v_names;
    ELSE
      SELECT COALESCE(sum(o.price), 0), string_agg(o.name, ', ' ORDER BY o.sort_order, o.name) INTO v_price, v_names
        FROM public.menu_options o WHERE o.group_id = g.id AND o.id = ANY(ids);
      extras := extras + v_price;
      parts := parts || (g.name || ': ' || v_names);
    END IF;
  END LOOP;
  price := round(base + extras, 2);
  label := NULLIF(array_to_string(parts, ' · '), '');
END $$;

-- descrição das opções nos itens lançados sem ela (ex.: pedidos públicos e integrações)
CREATE OR REPLACE FUNCTION public.order_item_options_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.options_text IS NULL AND jsonb_typeof(NEW.options) = 'array' AND jsonb_array_length(NEW.options) > 0 THEN
    NEW.options_text := (public.menu_item_quote(NEW.menu_item_id, NEW.options)).label;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_item_options_text ON public.order_items;
CREATE TRIGGER order_item_options_text BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_item_options_text();

-- via da cozinha mostra as opções junto da observação
DO $$
DECLARE d text := pg_get_functiondef('public.enqueue_kitchen_print'::regproc);
BEGIN
  IF position('options_text' in d) = 0 THEN
    d := replace(d, '''quantity'', NEW.quantity, ''notes'', NEW.notes)',
      '''quantity'', NEW.quantity, ''notes'', NULLIF(concat_ws('' — '', NEW.options_text, NEW.notes), ''''))');
    EXECUTE d;
  END IF;
END $$;

-- pedidos públicos (QR, totem e loja online): preço das opções e horário do prato conferidos no banco
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['create_qr_order', 'create_kiosk_order', 'create_online_order'] LOOP
    d := pg_get_functiondef(('public.' || f)::regproc);
    CONTINUE WHEN position('menu_item_quote' in d) > 0;
    d := replace(d, 'v_menu public.menu_items%ROWTYPE;', 'v_menu public.menu_items%ROWTYPE;' || chr(10) || '  v_q record;');
    -- disponível e no horário
    d := regexp_replace(d, '(AND mi\.available( = true)?);', '\1 AND public.menu_item_on_now(mi.available_days, mi.available_from, mi.available_to);', 'g');
    -- preço com as opções
    d := regexp_replace(d, '(IF NOT FOUND THEN RAISE EXCEPTION ''Um produto escolhido [^'']+''; END IF;)',
      '\1' || chr(10) || '    v_q := public.menu_item_quote(v_menu.id, v_item -> ''options'');' || chr(10) || '    v_menu.price := v_q.price;');
    d := replace(d, 'INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)',
      'INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status, options, options_text)');
    d := regexp_replace(d, '''pending''\);(\s+v_(total|subtotal) := v_\2 \+ \(?v_(menu\.price|price))',
      '''pending'', COALESCE(v_item -> ''options'', ''[]''), v_q.label);\1');
    EXECUTE d;
  END LOOP;
END $$;

-- central offline também recebe as opções
DO $$
DECLARE d text := pg_get_functiondef('public.offline_replica'::regproc);
BEGIN
  IF position('menu_option_groups' in d) = 0 THEN
    d := replace(d, '''rodizios''];', '''rodizios'', ''menu_option_groups'', ''menu_options''];');
    d := replace(d, '''rodizios'', (SELECT',
      '''menu_option_groups'', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.menu_option_groups t WHERE t.restaurant_id = _restaurant_id),' || chr(10) ||
      '      ''menu_options'', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.menu_options t WHERE t.restaurant_id = _restaurant_id),' || chr(10) ||
      '      ''rodizios'', (SELECT');
    EXECUTE d;
  END IF;
END $$;
