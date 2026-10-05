-- Rede de filiais (plano Enterprise):
--  1) painel consolidado: soma das lojas que a pessoa administra (dono: todas; supervisor: as dele)
--  2) cardápio da matriz enviado às filiais: cada cópia lembra de qual item/categoria da matriz veio (source_id)

-- ---------- origem das cópias do cardápio ----------
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS menu_categories_source_idx ON public.menu_categories (source_id);
CREATE INDEX IF NOT EXISTS menu_items_source_idx ON public.menu_items (source_id);

-- ---------- painel consolidado ----------
CREATE OR REPLACE FUNCTION public.network_summary(_from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre no sistema.'; END IF;
  IF _to <= _from OR _to - _from > interval '400 days' THEN RAISE EXCEPTION 'Período inválido.'; END IF;

  -- lojas ativas que a pessoa administra como dona (admin) ou supervisora
  SELECT COALESCE(array_agg(DISTINCT ur.restaurant_id), '{}') INTO v_ids
    FROM public.user_roles ur JOIN public.restaurants r ON r.id = ur.restaurant_id
   WHERE ur.user_id = v_uid AND ur.role IN ('admin', 'supervisor') AND r.status = 'active';
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'Painel da rede disponível para o dono e supervisores.'; END IF;

  RETURN jsonb_build_object(
    'from', _from, 'to', _to,
    'stores', (
      SELECT COALESCE(jsonb_agg(s ORDER BY (s->>'is_branch')::boolean, s->>'name'), '[]') FROM (
        SELECT jsonb_build_object(
          'id', r.id, 'name', r.name, 'is_branch', r.parent_id IS NOT NULL,
          'revenue', COALESCE((SELECT sum(p.amount) FROM public.payments p
                                WHERE p.restaurant_id = r.id AND p.created_at >= _from AND p.created_at < _to), 0),
          'paid_orders', (SELECT count(DISTINCT p.order_id) FROM public.payments p
                           WHERE p.restaurant_id = r.id AND p.created_at >= _from AND p.created_at < _to),
          'orders', (SELECT count(*) FROM public.orders o
                      WHERE o.restaurant_id = r.id AND o.created_at >= _from AND o.created_at < _to AND o.status <> 'cancelled'),
          'cancelled', (SELECT count(*) FROM public.orders o
                         WHERE o.restaurant_id = r.id AND o.created_at >= _from AND o.created_at < _to AND o.status = 'cancelled'),
          'items_sold', COALESCE((SELECT sum(i.quantity) FROM public.order_items i JOIN public.orders o ON o.id = i.order_id
                                   WHERE o.restaurant_id = r.id AND i.created_at >= _from AND i.created_at < _to AND i.status <> 'cancelled'), 0),
          'delivery_orders', (SELECT count(*) FROM public.orders o
                               WHERE o.restaurant_id = r.id AND o.created_at >= _from AND o.created_at < _to
                                 AND o.status <> 'cancelled' AND o.order_type = 'delivery'),
          'open_orders', (SELECT count(*) FROM public.orders o
                           WHERE o.restaurant_id = r.id AND o.archived_at IS NULL AND o.status NOT IN ('delivered', 'cancelled')),
          'register_open', EXISTS (SELECT 1 FROM public.cash_registers c WHERE c.restaurant_id = r.id AND c.closed_at IS NULL)
        ) AS s
        FROM public.restaurants r WHERE r.id = ANY(v_ids)
      ) x),
    'days', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d.day, 'store_id', d.restaurant_id, 'revenue', d.revenue) ORDER BY d.day), '[]')
        FROM (SELECT (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, p.restaurant_id, sum(p.amount) AS revenue
                FROM public.payments p
               WHERE p.restaurant_id = ANY(v_ids) AND p.created_at >= _from AND p.created_at < _to
               GROUP BY 1, 2) d),
    'top_items', (
      SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC), '[]') FROM (
        SELECT jsonb_build_object('name', COALESCE(m.name, 'Item'), 'quantity', sum(i.quantity), 'revenue', sum(i.quantity * i.unit_price),
                                  'stores', count(DISTINCT o.restaurant_id)) AS t
          FROM public.order_items i
          JOIN public.orders o ON o.id = i.order_id
          LEFT JOIN public.menu_items m ON m.id = i.menu_item_id
         WHERE o.restaurant_id = ANY(v_ids) AND i.created_at >= _from AND i.created_at < _to AND i.status <> 'cancelled'
         GROUP BY COALESCE(m.name, 'Item')
         ORDER BY sum(i.quantity * i.unit_price) DESC
         LIMIT 10) y),
    'payment_methods', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('method', pm.method, 'amount', pm.amount) ORDER BY pm.amount DESC), '[]')
        FROM (SELECT p.method::text AS method, sum(p.amount) AS amount FROM public.payments p
               WHERE p.restaurant_id = ANY(v_ids) AND p.created_at >= _from AND p.created_at < _to GROUP BY 1) pm)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.network_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.network_summary(timestamptz, timestamptz) TO authenticated;
