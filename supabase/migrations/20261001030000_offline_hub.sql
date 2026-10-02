-- Modo offline: o app de computador do caixa vira a "central" da loja.
-- Sem internet ela atende os aparelhos da rede local; quando a internet volta envia as operações
-- (pedidos, itens, status da cozinha, pagamentos) para cá, na ordem em que aconteceram.

CREATE TABLE IF NOT EXISTS public.offline_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key_hash text NOT NULL,                 -- sha256 da chave da central
  name text NOT NULL DEFAULT 'Computador do caixa',
  lan_urls text[] NOT NULL DEFAULT '{}',  -- endereços na rede local (para os aparelhos abrirem sem internet)
  version text,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  pending_ops integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offline_hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff see offline hub" ON public.offline_hubs;
CREATE POLICY "staff see offline hub" ON public.offline_hubs FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) OR public.has_role((SELECT auth.uid()), 'super_admin'));
DROP TRIGGER IF EXISTS offline_hubs_updated_at ON public.offline_hubs;
CREATE TRIGGER offline_hubs_updated_at BEFORE UPDATE ON public.offline_hubs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS offline_hubs_created_by_idx ON public.offline_hubs (created_by);

-- Operações já aplicadas (a central pode reenviar; aplicar duas vezes não duplica nada).
CREATE TABLE IF NOT EXISTS public.offline_op_log (
  hub_id uuid NOT NULL REFERENCES public.offline_hubs(id) ON DELETE CASCADE,
  op_id uuid NOT NULL,
  op_type text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hub_id, op_id)
);
ALTER TABLE public.offline_op_log ENABLE ROW LEVEL SECURITY;

-- ---------- sincronização não reimprime nem bloqueia o que já aconteceu na loja ----------
CREATE OR REPLACE FUNCTION public.is_offline_sync()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(current_setting('oxys.offline_sync', true), '') = 'on'
$$;

DO $$
DECLARE d text;
BEGIN
  -- via da cozinha: já saiu na impressora da loja durante o offline
  SELECT pg_get_functiondef('public.enqueue_kitchen_print()'::regprocedure) INTO d;
  IF position('is_offline_sync' in d) = 0 THEN
    d := regexp_replace(d, 'BEGIN\n', E'BEGIN\n  IF public.is_offline_sync() THEN RETURN NEW; END IF;\n', '');
    EXECUTE d;
  END IF;

  -- recibo: já saiu na loja; a NFC-e continua sendo gerada
  SELECT pg_get_functiondef('public.on_payment_recorded()'::regprocedure) INTO d;
  IF position('is_offline_sync' in d) = 0 THEN
    d := replace(d, $x$WHERE restaurant_id = v_order.restaurant_id AND enabled AND auto_print AND 'receipt' = ANY(purposes)$x$,
                    $x$WHERE restaurant_id = v_order.restaurant_id AND enabled AND auto_print AND 'receipt' = ANY(purposes)
      AND NOT public.is_offline_sync()$x$);
    IF position('is_offline_sync' in d) = 0 THEN RAISE EXCEPTION 'on_payment_recorded: trecho não encontrado'; END IF;
    EXECUTE d;
  END IF;

  -- reserva de mesa: a mesa já foi ocupada na loja
  SELECT pg_get_functiondef('public.enforce_table_reservation()'::regprocedure) INTO d;
  IF position('is_offline_sync' in d) = 0 THEN
    d := regexp_replace(d, 'BEGIN\n', E'BEGIN\n  IF public.is_offline_sync() THEN RETURN NEW; END IF;\n', '');
    EXECUTE d;
  END IF;
END $$;

-- ---------- retrato da loja para a central (cardápio, mesas, pedidos abertos, equipe, impressoras) ----------
CREATE OR REPLACE FUNCTION public.offline_snapshot(_restaurant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH open_orders AS (
    SELECT o.* FROM public.orders o
     WHERE o.restaurant_id = _restaurant_id AND o.archived_at IS NULL AND o.status <> 'cancelled'
       AND o.created_at > now() - interval '2 days'
       AND (o.status <> 'delivered'
            OR COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.order_id = o.id), 0) + 0.009
               < (SELECT COALESCE(sum(i.quantity * i.unit_price), 0) FROM public.order_items i WHERE i.order_id = o.id AND i.status <> 'cancelled') + COALESCE(o.delivery_fee, 0))
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'restaurant', (SELECT jsonb_build_object('id', r.id, 'name', COALESCE(NULLIF(btrim(b.brand_name), ''), r.name), 'address', r.address)
                     FROM public.restaurants r LEFT JOIN public.branding_settings b ON b.restaurant_id = r.id WHERE r.id = _restaurant_id),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name)
                     FROM public.menu_categories c WHERE c.restaurant_id = _restaurant_id), '[]'),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price, 'category_id', m.category_id, 'description', m.description) ORDER BY m.name)
                     FROM public.menu_items m WHERE m.restaurant_id = _restaurant_id AND m.available), '[]'),
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'capacity', t.capacity, 'status', t.status) ORDER BY t.number)
                     FROM public.restaurant_tables t WHERE t.restaurant_id = _restaurant_id), '[]'),
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', o.id, 'table_id', o.table_id, 'order_type', o.order_type, 'status', o.status, 'customer_name', o.customer_name,
                       'customer_phone', o.customer_phone, 'customer_address', o.customer_address, 'delivery_fee', o.delivery_fee,
                       'notes', o.notes, 'created_at', o.created_at, 'created_by_name', o.created_by_name, 'created_by_role', o.created_by_role,
                       'source', o.source,
                       'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'menu_item_id', i.menu_item_id, 'name', COALESCE(m.name, 'Item'),
                                   'quantity', i.quantity, 'unit_price', i.unit_price, 'notes', i.notes, 'status', i.status, 'created_at', i.created_at) ORDER BY i.created_at)
                                 FROM public.order_items i LEFT JOIN public.menu_items m ON m.id = i.menu_item_id WHERE i.order_id = o.id), '[]'),
                       'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'method', p.method, 'amount', p.amount, 'change_amount', p.change_amount, 'created_at', p.created_at) ORDER BY p.created_at)
                                 FROM public.payments p WHERE p.order_id = o.id), '[]')
                     ) ORDER BY o.created_at) FROM open_orders o), '[]'),
    'staff', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('user_id', ur.user_id, 'email', u.email, 'role', ur.role))
                     FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
                    WHERE ur.restaurant_id = _restaurant_id AND ur.role IN ('admin', 'waiter', 'cashier', 'kitchen', 'delivery', 'finance')), '[]'),
    'printers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'purposes', p.purposes, 'width', p.width, 'copies', p.copies,
                       'header_note', p.header_note, 'footer_note', p.footer_note, 'connection', p.connection, 'auto_print', p.auto_print) ORDER BY p.name)
                     FROM public.printers p WHERE p.restaurant_id = _restaurant_id AND p.enabled), '[]'),
    'cash_register_id', (SELECT c.id FROM public.cash_registers c WHERE c.restaurant_id = _restaurant_id AND c.closed_at IS NULL ORDER BY c.opened_at DESC LIMIT 1),
    'fiscal_auto_emit', COALESCE((SELECT f.active AND f.auto_emit_on_payment FROM public.fiscal_profiles f WHERE f.restaurant_id = _restaurant_id), false)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.offline_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_snapshot(uuid) TO service_role;

-- ---------- aplica as operações feitas sem internet ----------
-- Cada operação: { id, type, at, user_id, data }. Tipos:
--   order.open   { id, table_id, order_type, customer_name, customer_phone, customer_address, notes, created_by_name, created_by_role }
--   items.add    { order_id, items: [{ id, menu_item_id, quantity, unit_price, notes }] }
--   item.status  { item_id, status }
--   order.update { order_id, customer_name?, table_id? }
--   payment.add  { id, order_id, method, amount, change_amount }
--   order.settle { order_id }
--   table.status { table_id, status }
CREATE OR REPLACE FUNCTION public.apply_offline_ops(_hub_id uuid, _ops jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hub public.offline_hubs%ROWTYPE;
  v_op jsonb;
  v_d jsonb;
  v_id uuid;
  v_at timestamptz;
  v_user uuid;
  v_item jsonb;
  v_register uuid;
  v_applied jsonb := '[]';
  v_failed jsonb := '[]';
BEGIN
  SELECT * INTO v_hub FROM public.offline_hubs WHERE id = _hub_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Central não encontrada'; END IF;
  PERFORM set_config('oxys.offline_sync', 'on', true);
  SELECT c.id INTO v_register FROM public.cash_registers c
   WHERE c.restaurant_id = v_hub.restaurant_id AND c.closed_at IS NULL ORDER BY c.opened_at DESC LIMIT 1;

  FOR v_op IN SELECT value FROM jsonb_array_elements(COALESCE(_ops, '[]')) LOOP
    v_id := (v_op->>'id')::uuid;
    IF EXISTS (SELECT 1 FROM public.offline_op_log WHERE hub_id = _hub_id AND op_id = v_id) THEN
      v_applied := v_applied || to_jsonb(v_id::text);
      CONTINUE;
    END IF;
    v_d := v_op->'data';
    v_at := COALESCE((v_op->>'at')::timestamptz, now());
    -- quem fez: alguém da equipe da loja; senão, quem ativou a central
    v_user := (SELECT ur.user_id FROM public.user_roles ur
                WHERE ur.user_id = NULLIF(v_op->>'user_id', '')::uuid AND ur.restaurant_id = v_hub.restaurant_id LIMIT 1);
    v_user := COALESCE(v_user, v_hub.created_by);

    BEGIN
      CASE v_op->>'type'
      WHEN 'order.open' THEN
        IF (v_d->>'table_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.restaurant_tables t WHERE t.id = (v_d->>'table_id')::uuid AND t.restaurant_id = v_hub.restaurant_id) THEN
          RAISE EXCEPTION 'Mesa de outro restaurante';
        END IF;
        INSERT INTO public.orders (id, restaurant_id, table_id, order_type, status, total, customer_name, customer_phone, customer_address,
                                   notes, waiter_id, created_by, created_by_name, created_by_role, source, created_at, delivery_status)
        VALUES ((v_d->>'id')::uuid, v_hub.restaurant_id, NULLIF(v_d->>'table_id', '')::uuid,
                COALESCE(NULLIF(v_d->>'order_type', ''), 'dine_in'), 'pending', 0,
                NULLIF(left(v_d->>'customer_name', 80), ''), NULLIF(left(v_d->>'customer_phone', 20), ''), NULLIF(left(v_d->>'customer_address', 300), ''),
                NULLIF(left(v_d->>'notes', 500), ''), CASE WHEN COALESCE(v_d->>'order_type', 'dine_in') = 'dine_in' THEN v_user END,
                v_user, left(COALESCE(v_d->>'created_by_name', 'Modo offline'), 120), left(v_d->>'created_by_role', 30), 'offline', v_at, 'pending')
        ON CONFLICT (id) DO NOTHING;
        IF (v_d->>'table_id') IS NOT NULL THEN
          UPDATE public.restaurant_tables SET status = 'occupied' WHERE id = (v_d->>'table_id')::uuid AND status = 'free';
        END IF;

      WHEN 'items.add' THEN
        IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = (v_d->>'order_id')::uuid AND o.restaurant_id = v_hub.restaurant_id) THEN
          RAISE EXCEPTION 'Pedido não encontrado';
        END IF;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_d->'items') LOOP
          INSERT INTO public.order_items (id, order_id, menu_item_id, quantity, unit_price, notes, status, created_at)
          SELECT (v_item->>'id')::uuid, (v_d->>'order_id')::uuid, m.id, GREATEST(1, (v_item->>'quantity')::int),
                 COALESCE((v_item->>'unit_price')::numeric, m.price), NULLIF(left(v_item->>'notes', 300), ''), 'pending', v_at
            FROM public.menu_items m WHERE m.id = (v_item->>'menu_item_id')::uuid AND m.restaurant_id = v_hub.restaurant_id
          ON CONFLICT (id) DO NOTHING;
        END LOOP;
        UPDATE public.orders o SET
          total = (SELECT COALESCE(sum(i.quantity * i.unit_price), 0) FROM public.order_items i WHERE i.order_id = o.id AND i.status <> 'cancelled'),
          status = CASE WHEN o.status = 'delivered' THEN 'pending' ELSE o.status END
        WHERE o.id = (v_d->>'order_id')::uuid;

      WHEN 'item.status' THEN
        UPDATE public.order_items i SET status = (v_d->>'status')::order_item_status
          FROM public.orders o
         WHERE i.id = (v_d->>'item_id')::uuid AND o.id = i.order_id AND o.restaurant_id = v_hub.restaurant_id;

      WHEN 'order.update' THEN
        UPDATE public.orders SET
          customer_name = CASE WHEN v_d ? 'customer_name' THEN NULLIF(left(v_d->>'customer_name', 80), '') ELSE customer_name END,
          table_id = CASE WHEN v_d ? 'table_id' THEN NULLIF(v_d->>'table_id', '')::uuid ELSE table_id END
        WHERE id = (v_d->>'order_id')::uuid AND restaurant_id = v_hub.restaurant_id;

      WHEN 'payment.add' THEN
        IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = (v_d->>'order_id')::uuid AND o.restaurant_id = v_hub.restaurant_id) THEN
          RAISE EXCEPTION 'Pedido não encontrado';
        END IF;
        INSERT INTO public.payments (id, order_id, restaurant_id, cash_register_id, method, amount, change_amount, user_id, created_at)
        VALUES ((v_d->>'id')::uuid, (v_d->>'order_id')::uuid, v_hub.restaurant_id, v_register,
                (v_d->>'method')::payment_method, (v_d->>'amount')::numeric, COALESCE((v_d->>'change_amount')::numeric, 0), v_user, v_at)
        ON CONFLICT (id) DO NOTHING;

      WHEN 'order.settle' THEN
        UPDATE public.orders o SET status = 'delivered',
          total = (SELECT COALESCE(sum(i.quantity * i.unit_price), 0) FROM public.order_items i WHERE i.order_id = o.id AND i.status <> 'cancelled')
        WHERE o.id = (v_d->>'order_id')::uuid AND o.restaurant_id = v_hub.restaurant_id;

      WHEN 'table.status' THEN
        UPDATE public.restaurant_tables SET status = (v_d->>'status')::table_status
        WHERE id = (v_d->>'table_id')::uuid AND restaurant_id = v_hub.restaurant_id;

      ELSE
        RAISE EXCEPTION 'Operação desconhecida: %', v_op->>'type';
      END CASE;

      INSERT INTO public.offline_op_log (hub_id, op_id, op_type) VALUES (_hub_id, v_id, v_op->>'type');
      v_applied := v_applied || to_jsonb(v_id::text);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_object('id', v_id, 'error', SQLERRM);
    END;
  END LOOP;

  UPDATE public.offline_hubs SET last_sync_at = now() WHERE id = _hub_id;
  RETURN jsonb_build_object('applied', v_applied, 'failed', v_failed);
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_offline_ops(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_offline_ops(uuid, jsonb) TO service_role;
