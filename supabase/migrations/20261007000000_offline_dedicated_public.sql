-- 1) Central offline: balanço de estoque e totem funcionam sem internet.
-- 2) Servidor dedicado: loja online, cardápio QR e avaliação chegam ao servidor da loja pela nuvem (repasse assinado).
-- 3) Loja online: o cliente usa o saldo de cashback no pedido.

-- ---------- servidor dedicado: segredo do repasse e endereço da loja online ----------
ALTER TABLE public.dedicated_servers
  ADD COLUMN IF NOT EXISTS relay_secret text,
  ADD COLUMN IF NOT EXISTS store_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS dedicated_servers_store_slug ON public.dedicated_servers (store_slug) WHERE store_slug IS NOT NULL;

-- ---------- balanço concluído na central offline (aplicado quando a internet volta) ----------
-- Mesmo cálculo de close_stock_count, para a pessoa e a loja informadas (sem sessão).
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.close_stock_count(uuid,text,text,text,text,boolean)'::regprocedure) INTO d;
  d := replace(d, 'FUNCTION public.close_stock_count(_count_id uuid,', 'FUNCTION public.stock_count_close_core(_uid uuid, _rid uuid, _count_id uuid,');
  d := replace(d, 'v_uid uuid := auth.uid();', 'v_uid uuid := _uid;');
  d := replace(d, 'v_rid uuid := public.get_user_restaurant_id(v_uid);', 'v_rid uuid := _rid;');
  d := replace(d, $x$IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finance')) THEN$x$,
    $x$IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.restaurant_id = v_rid
                    AND ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'finance'::app_role])) THEN$x$);
  IF position('stock_count_close_core' in d) = 0 OR position('v_rid uuid := _rid;' in d) = 0 OR position('ur.restaurant_id = v_rid' in d) = 0 THEN
    RAISE EXCEPTION 'close_stock_count: trecho não encontrado';
  END IF;
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.stock_count_close_core(uuid, uuid, uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.apply_offline_ops(uuid,jsonb)'::regprocedure) INTO d;
  IF position('stock.close' in d) > 0 THEN RETURN; END IF;
  a := $x$      ELSE
        RAISE EXCEPTION 'Operação desconhecida: %', v_op->>'type';$x$;
  b := $x$      WHEN 'stock.close' THEN
        PERFORM public.stock_count_close_core(v_user, v_hub.restaurant_id, (v_d->>'count_id')::uuid, v_d->>'responsible_name',
          v_d->>'responsible_role', v_d->>'general_notes', v_d->>'signature', COALESCE((v_d->>'adjust')::boolean, false));

      ELSE
        RAISE EXCEPTION 'Operação desconhecida: %', v_op->>'type';$x$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'apply_offline_ops: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, b);
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_offline_ops(uuid, jsonb) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.offline_apply_row(uuid,jsonb)'::regprocedure) INTO d;
  IF position('stock_counts' in d) > 0 THEN RETURN; END IF;
  a := $x$"audit_logs": ["insert"], "notifications": ["update"]$x$;
  b := $x$"audit_logs": ["insert"], "notifications": ["update"],
    "stock_counts": ["insert","update"], "stock_count_items": ["insert","update"]$x$;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'offline_apply_row: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, b);
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_apply_row(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Cópia da central: estoque, balanços em aberto e recentes, totens e configuração das avaliações.
DO $$
DECLARE d text; a text; b text; c text; e text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  IF position('stock_counts' in d) > 0 THEN RETURN; END IF;
  a := $x$'audit_logs', 'service_settings'];$x$;
  b := $x$'audit_logs', 'service_settings', 'inventory', 'stock_count_settings', 'stock_counts', 'stock_count_items', 'kiosks', 'feedback_settings'];$x$;
  c := $x$      'print_jobs', '[]'::jsonb,$x$;
  e := $x$      'inventory', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.inventory t WHERE t.restaurant_id = _restaurant_id),
      'stock_count_settings', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.stock_count_settings t WHERE t.restaurant_id = _restaurant_id),
      'stock_counts', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.stock_counts t WHERE t.restaurant_id = _restaurant_id
                         AND (t.status IN ('scheduled', 'counting') OR t.created_at > now() - interval '45 days')),
      'stock_count_items', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]') FROM public.stock_count_items i JOIN public.stock_counts t ON t.id = i.count_id
                         WHERE t.restaurant_id = _restaurant_id AND (t.status IN ('scheduled', 'counting') OR t.created_at > now() - interval '45 days')),
      'kiosks', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.kiosks t WHERE t.restaurant_id = _restaurant_id),
      'feedback_settings', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.feedback_settings t WHERE t.restaurant_id = _restaurant_id),
      'print_jobs', '[]'::jsonb,$x$;
  IF position(a in d) = 0 OR position(c in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a, b), c, e);
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_replica(uuid) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_offline_hub_change') THEN
    DROP TRIGGER IF EXISTS offline_hub_notify ON public.inventory;
    CREATE TRIGGER offline_hub_notify AFTER INSERT OR UPDATE OR DELETE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.notify_offline_hub_change();
    DROP TRIGGER IF EXISTS offline_hub_notify ON public.stock_counts;
    CREATE TRIGGER offline_hub_notify AFTER INSERT OR UPDATE OR DELETE ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION public.notify_offline_hub_change();
    DROP TRIGGER IF EXISTS offline_hub_notify ON public.kiosks;
    CREATE TRIGGER offline_hub_notify AFTER INSERT OR UPDATE OR DELETE ON public.kiosks FOR EACH ROW EXECUTE FUNCTION public.notify_offline_hub_change();
  END IF;
END $$;

-- ---------- loja online: usar o saldo de cashback no pedido ----------
DO $$
DECLARE d text; a text; b text; c text; e text;
BEGIN
  SELECT pg_get_functiondef('public.create_online_order(text,jsonb,uuid)'::regprocedure) INTO d;
  IF position('use_cashback' in d) > 0 THEN RETURN; END IF;
  a := $x$  v_token uuid := gen_random_uuid();$x$;
  b := $x$  v_token uuid := gen_random_uuid();
  v_acc public.loyalty_accounts%ROWTYPE;
  v_cashback numeric;$x$;
  c := $x$  PERFORM public.link_store_customer(v_store.restaurant_id, _user_id);$x$;
  e := $x$  PERFORM public.link_store_customer(v_store.restaurant_id, _user_id);

  -- cashback do cliente: abate do total (o restante é pago na entrega/retirada)
  IF COALESCE((_order->>'use_cashback')::boolean, false)
     AND public.restaurant_has_feature(v_store.restaurant_id, 'loyalty')
     AND EXISTS (SELECT 1 FROM public.loyalty_programs p WHERE p.restaurant_id = v_store.restaurant_id AND p.enabled AND p.mode = 'cashback') THEN
    SELECT * INTO v_acc FROM public.loyalty_accounts WHERE restaurant_id = v_store.restaurant_id AND customer_phone = v_phone;
    v_cashback := LEAST(COALESCE(v_acc.cashback_balance, 0), v_subtotal + v_fee);
    IF v_cashback >= 0.01 THEN
      INSERT INTO public.payments (order_id, restaurant_id, method, amount, user_id)
      VALUES (v_order, v_store.restaurant_id, 'cashback', round(v_cashback, 2), _user_id);
    END IF;
  END IF;$x$;
  IF position(a in d) = 0 OR position(c in d) = 0 THEN RAISE EXCEPTION 'create_online_order: trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a, b), c, e);
END $$;
