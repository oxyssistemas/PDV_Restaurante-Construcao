-- Modo offline com as MESMAS telas: a central vira um espelho do banco da loja e responde às telas como
-- a nuvem responderia. Aqui: o retrato completo das tabelas da operação e a aplicação, linha a linha,
-- do que foi gravado sem internet.

-- ---------- retrato das tabelas da operação ----------
CREATE OR REPLACE FUNCTION public.offline_replica(_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since timestamptz := now() - interval '2 days';
  v_orders uuid[];
  v_registers uuid[];
  v_tables text[] := ARRAY['restaurants', 'plans', 'branding_settings', 'module_permissions', 'user_roles', 'notifications',
    'menu_categories', 'menu_items', 'restaurant_tables', 'reservations', 'orders', 'order_items', 'payments',
    'cash_registers', 'cash_movements', 'kitchen_sessions', 'couriers', 'printers', 'ifood_orders', 'print_jobs', 'audit_logs'];
BEGIN
  SELECT COALESCE(array_agg(o.id), '{}') INTO v_orders FROM public.orders o
   WHERE o.restaurant_id = _restaurant_id AND (o.archived_at IS NULL OR o.created_at > v_since);
  SELECT COALESCE(array_agg(c.id), '{}') INTO v_registers FROM public.cash_registers c
   WHERE c.restaurant_id = _restaurant_id AND (c.closed_at IS NULL OR c.opened_at > v_since);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'restaurant_id', _restaurant_id,
    'rows', jsonb_build_object(
      'restaurants', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.restaurants t WHERE t.id = _restaurant_id),
      'plans', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.plans t),
      'branding_settings', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.branding_settings t WHERE t.restaurant_id = _restaurant_id),
      'module_permissions', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.module_permissions t WHERE t.restaurant_id = _restaurant_id),
      'user_roles', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.user_roles t WHERE t.restaurant_id = _restaurant_id),
      'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM (SELECT * FROM public.notifications n WHERE n.restaurant_id = _restaurant_id ORDER BY n.created_at DESC LIMIT 100) t),
      'menu_categories', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.menu_categories t WHERE t.restaurant_id = _restaurant_id),
      'menu_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.menu_items t WHERE t.restaurant_id = _restaurant_id),
      'restaurant_tables', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.restaurant_tables t WHERE t.restaurant_id = _restaurant_id),
      'reservations', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.reservations t WHERE t.restaurant_id = _restaurant_id AND t.reservation_date >= current_date - 1),
      'orders', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.orders t WHERE t.id = ANY(v_orders)),
      'order_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.order_items t WHERE t.order_id = ANY(v_orders)),
      'payments', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.payments t WHERE t.order_id = ANY(v_orders) OR t.cash_register_id = ANY(v_registers)),
      'cash_registers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.cash_registers t WHERE t.id = ANY(v_registers)),
      'cash_movements', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.cash_movements t WHERE t.cash_register_id = ANY(v_registers)),
      'kitchen_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.kitchen_sessions t WHERE t.restaurant_id = _restaurant_id AND (t.closed_at IS NULL OR t.opened_at > v_since)),
      'couriers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.couriers t WHERE t.restaurant_id = _restaurant_id),
      -- impressoras sem o segredo das impressoras na nuvem
      'printers', (SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'device_token'), '[]') FROM public.printers t WHERE t.restaurant_id = _restaurant_id),
      'ifood_orders', (SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'payload'), '[]') FROM public.ifood_orders t WHERE t.restaurant_id = _restaurant_id AND t.created_at > v_since),
      'print_jobs', '[]'::jsonb,
      'audit_logs', '[]'::jsonb
    ),
    -- ligações entre tabelas (para "pedido com itens", "item com produto"...)
    'relations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('table', cl.relname, 'column', a.attname, 'ref_table', rcl.relname, 'ref_column', ra.attname)), '[]')
                    FROM pg_constraint c
                    JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
                    JOIN pg_class rcl ON rcl.oid = c.confrelid
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                    JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
                   WHERE c.contype = 'f' AND cl.relname = ANY(v_tables) AND rcl.relname = ANY(v_tables)),
    -- valores padrão das colunas (para gravar offline como o banco gravaria)
    'defaults', (SELECT COALESCE(jsonb_object_agg(x.table_name, x.cols), '{}') FROM (
                   SELECT c.table_name, jsonb_object_agg(c.column_name, c.column_default) AS cols
                     FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = ANY(v_tables) AND c.column_default IS NOT NULL
                    GROUP BY c.table_name) x)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_replica(uuid) TO service_role;

-- ---------- aplica uma linha gravada sem internet (inserir / alterar / apagar) ----------
-- Só tabelas da operação, sempre conferindo que a linha é da loja da central.
CREATE OR REPLACE FUNCTION public.offline_apply_row(_restaurant_id uuid, _op jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table text := _op->>'table';
  v_action text := _op->>'action';
  v_id uuid := (_op->>'id')::uuid;
  v_data jsonb := COALESCE(_op->'data', '{}'::jsonb);
  v_allowed jsonb := '{
    "orders": ["insert","update","delete"], "order_items": ["insert","update","delete"], "payments": ["insert","update","delete"],
    "restaurant_tables": ["update"], "reservations": ["insert","update"], "cash_registers": ["insert","update"],
    "cash_movements": ["insert","update","delete"], "kitchen_sessions": ["insert","update"], "couriers": ["update"],
    "audit_logs": ["insert"], "notifications": ["update"]
  }'::jsonb;
  v_cols text[];
  v_owner uuid;
  v_sql text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Linha sem id'; END IF;
  IF NOT (v_allowed ? v_table) OR NOT (v_allowed->v_table ? v_action) THEN
    RAISE EXCEPTION 'Gravação offline não permitida: % em %', v_action, v_table;
  END IF;

  -- dono da linha: restaurante (itens: pelo pedido)
  IF v_table = 'order_items' THEN
    SELECT o.restaurant_id INTO v_owner FROM public.orders o
     WHERE o.id = COALESCE((v_data->>'order_id')::uuid, (SELECT i.order_id FROM public.order_items i WHERE i.id = v_id));
    IF v_owner IS NULL AND v_action <> 'insert' THEN RETURN; END IF; -- item já não existe
  ELSIF v_action = 'insert' THEN
    v_owner := (v_data->>'restaurant_id')::uuid;
  ELSE
    EXECUTE format('SELECT restaurant_id FROM public.%I WHERE id = $1', v_table) INTO v_owner USING v_id;
    IF v_owner IS NULL THEN RETURN; END IF; -- já não existe: nada a fazer
  END IF;
  IF v_owner IS DISTINCT FROM _restaurant_id THEN RAISE EXCEPTION 'Linha de outro restaurante (%)', v_table; END IF;
  IF v_action = 'update' AND v_data ? 'restaurant_id' AND (v_data->>'restaurant_id')::uuid IS DISTINCT FROM _restaurant_id THEN
    RAISE EXCEPTION 'Não pode mudar o restaurante da linha';
  END IF;

  -- colunas enviadas que existem na tabela
  SELECT array_agg(a.attname ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = ('public.' || quote_ident(v_table))::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND v_data ? a.attname AND a.attname <> 'id';
  v_cols := COALESCE(v_cols, '{}');

  IF v_action = 'insert' THEN
    v_sql := format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT (id) DO NOTHING',
                    v_table, array_to_string(ARRAY(SELECT quote_ident(c) FROM unnest(v_cols || ARRAY['id']) c), ', '));
    EXECUTE v_sql USING v_data || jsonb_build_object('id', v_id);
  ELSIF v_action = 'update' THEN
    IF array_length(v_cols, 1) IS NULL THEN RETURN; END IF;
    v_sql := format('UPDATE public.%1$I SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1)) WHERE id = $2',
                    v_table, array_to_string(ARRAY(SELECT quote_ident(c) FROM unnest(v_cols) c), ', '));
    -- uma coluna só: SET (a) = (SELECT a ...) precisa da forma ROW
    IF array_length(v_cols, 1) = 1 THEN
      v_sql := format('UPDATE public.%1$I SET %2$I = (SELECT %2$I FROM jsonb_populate_record(NULL::public.%1$I, $1)) WHERE id = $2', v_table, v_cols[1]);
    END IF;
    EXECUTE v_sql USING v_data, v_id;
  ELSE
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING v_id;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_apply_row(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_apply_row(uuid, jsonb) TO service_role;

-- ---------- apply_offline_ops ganha as gravações linha a linha (row.insert / row.update / row.delete) ----------
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.apply_offline_ops(uuid,jsonb)'::regprocedure) INTO d;
  IF position('offline_apply_row' in d) = 0 THEN
    d := replace(d, $x$      ELSE
        RAISE EXCEPTION 'Operação desconhecida: %', v_op->>'type';$x$,
$x$      WHEN 'row.insert', 'row.update', 'row.delete' THEN
        PERFORM public.offline_apply_row(v_hub.restaurant_id, v_d || jsonb_build_object('action', split_part(v_op->>'type', '.', 2)));

      ELSE
        RAISE EXCEPTION 'Operação desconhecida: %', v_op->>'type';$x$);
    IF position('offline_apply_row' in d) = 0 THEN RAISE EXCEPTION 'apply_offline_ops: trecho não encontrado'; END IF;
    EXECUTE d;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_offline_ops(uuid, jsonb) FROM PUBLIC, anon, authenticated;
