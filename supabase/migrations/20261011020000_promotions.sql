-- Promoções: happy hour (% em pratos/categorias numa faixa de horário), leve X pague Y e cupom da loja online.
-- Happy hour e leve X pague Y são automáticos: o desconto do pedido (orders.discount) é recalculado pelo banco
-- sempre que os itens mudam, pelo horário em que cada item foi lançado. O cupom é informado pelo cliente na loja.
-- Valor a pagar = itens (orders.total) + entrega + serviço + couvert − desconto.

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('happy_hour', 'buy_x_pay_y', 'coupon')),
  active boolean NOT NULL DEFAULT true,
  starts_on date,
  ends_on date,
  days smallint[] NOT NULL DEFAULT '{}',
  time_from time,
  time_to time,
  channels text[] NOT NULL DEFAULT '{salon,counter,delivery}',
  item_ids uuid[] NOT NULL DEFAULT '{}',
  category_ids uuid[] NOT NULL DEFAULT '{}',
  percent numeric(5,2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  buy_qty integer CHECK (buy_qty IS NULL OR buy_qty BETWEEN 2 AND 20),
  pay_qty integer CHECK (pay_qty IS NULL OR pay_qty >= 1),
  code text CHECK (code IS NULL OR code ~ '^[A-Z0-9_-]{3,20}$'),
  discount_type text CHECK (discount_type IS NULL OR discount_type IN ('percent', 'amount', 'free_delivery')),
  amount numeric(10,2) CHECK (amount IS NULL OR amount > 0),
  min_order numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  per_customer integer CHECK (per_customer IS NULL OR per_customer > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'happy_hour' OR percent IS NOT NULL),
  CHECK (kind <> 'buy_x_pay_y' OR (buy_qty IS NOT NULL AND pay_qty IS NOT NULL AND pay_qty < buy_qty)),
  CHECK (kind <> 'coupon' OR (code IS NOT NULL AND discount_type IS NOT NULL
         AND (discount_type = 'free_delivery' OR (discount_type = 'percent' AND percent IS NOT NULL) OR (discount_type = 'amount' AND amount IS NOT NULL))))
);
CREATE INDEX IF NOT EXISTS promotions_restaurant_idx ON public.promotions (restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_uniq ON public.promotions (restaurant_id, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_user_id uuid,
  customer_phone text,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_promo_idx ON public.coupon_redemptions (promotion_id);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view promotions" ON public.promotions FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));
CREATE POLICY "Admins can manage promotions" ON public.promotions FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));
CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER offline_hub_notify AFTER INSERT OR DELETE OR UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION notify_offline_hub_change();

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view coupon redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_discount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_labels text,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(10,2) NOT NULL DEFAULT 0;

-- faixa de dias/horário num instante (horário de Brasília); vazio = sempre
CREATE OR REPLACE FUNCTION public.in_time_window(_days smallint[], _from time, _to time, _at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH n AS (SELECT (_at AT TIME ZONE 'America/Sao_Paulo') AS ts)
  SELECT (COALESCE(cardinality(_days), 0) = 0 OR extract(dow FROM n.ts)::smallint = ANY(_days))
     AND (_from IS NULL OR _to IS NULL OR _from = _to
          OR (_from < _to AND n.ts::time >= _from AND n.ts::time < _to)
          OR (_from > _to AND (n.ts::time >= _from OR n.ts::time < _to)))
  FROM n
$$;

CREATE OR REPLACE FUNCTION public.menu_item_on_now(_days smallint[], _from time, _to time)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.in_time_window(_days, _from, _to, now())
$$;

-- canal do pedido para as promoções: salão, balcão (totem/retirada) ou delivery; apps de entrega ficam de fora
CREATE OR REPLACE FUNCTION public.order_promo_channel(_source text, _order_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _source IN ('ifood', '99food', 'keeta', 'rappi') THEN NULL
    WHEN _order_type = 'delivery' OR _source IN ('site', 'whatsapp') THEN 'delivery'
    WHEN _order_type = 'dine_in' THEN 'salon'
    ELSE 'counter' END
$$;

-- desconto automático do pedido: happy hour primeiro, depois leve X pague Y nos itens que sobraram
CREATE OR REPLACE FUNCTION public.order_promo_discount(_order uuid, OUT discount numeric, OUT labels text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  ch text;
  p record;
  d numeric;
  used uuid[] := '{}';
  hit uuid[];
  names text[] := '{}';
  v_day date;
BEGIN
  discount := 0;
  SELECT * INTO o FROM public.orders WHERE id = _order;
  IF NOT FOUND THEN RETURN; END IF;
  ch := public.order_promo_channel(o.source, o.order_type);
  IF ch IS NULL THEN RETURN; END IF;
  v_day := (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR p IN SELECT * FROM public.promotions pr
    WHERE pr.restaurant_id = o.restaurant_id AND pr.active AND pr.kind IN ('happy_hour', 'buy_x_pay_y')
      AND ch = ANY(pr.channels)
      AND (pr.starts_on IS NULL OR pr.starts_on <= v_day) AND (pr.ends_on IS NULL OR pr.ends_on >= v_day)
    ORDER BY (pr.kind <> 'happy_hour'), pr.created_at
  LOOP
    IF p.kind = 'happy_hour' THEN
      SELECT COALESCE(sum(oi.unit_price * oi.quantity), 0) * p.percent / 100, COALESCE(array_agg(oi.id), '{}')
        INTO d, hit
        FROM public.order_items oi JOIN public.menu_items m ON m.id = oi.menu_item_id
       WHERE oi.order_id = _order AND oi.status <> 'cancelled' AND oi.unit_price > 0 AND NOT m.is_rodizio_charge
         AND NOT (oi.id = ANY(used))
         AND ((cardinality(p.item_ids) = 0 AND cardinality(p.category_ids) = 0) OR m.id = ANY(p.item_ids) OR m.category_id = ANY(p.category_ids))
         AND public.in_time_window(p.days, p.time_from, p.time_to, oi.created_at);
    ELSE
      WITH units AS (
        SELECT oi.id, oi.unit_price
          FROM public.order_items oi JOIN public.menu_items m ON m.id = oi.menu_item_id
          CROSS JOIN LATERAL generate_series(1, oi.quantity)
         WHERE oi.order_id = _order AND oi.status <> 'cancelled' AND oi.unit_price > 0 AND NOT m.is_rodizio_charge
           AND NOT (oi.id = ANY(used))
           AND ((cardinality(p.item_ids) = 0 AND cardinality(p.category_ids) = 0) OR m.id = ANY(p.item_ids) OR m.category_id = ANY(p.category_ids))
           AND public.in_time_window(p.days, p.time_from, p.time_to, oi.created_at)
      ), ranked AS (
        SELECT id, unit_price, row_number() OVER (ORDER BY unit_price, id) AS rn, count(*) OVER () AS n FROM units
      )
      SELECT COALESCE(sum(unit_price) FILTER (WHERE rn <= (n / p.buy_qty) * (p.buy_qty - p.pay_qty)), 0),
             COALESCE(array_agg(DISTINCT id), '{}')
        INTO d, hit FROM ranked;
      IF d = 0 THEN hit := '{}'; END IF;
    END IF;
    d := round(COALESCE(d, 0), 2);
    IF d > 0 THEN
      discount := discount + d;
      names := names || p.name;
      used := used || hit;
    END IF;
  END LOOP;
  labels := NULLIF(array_to_string(names, ' · '), '');
END $$;

-- grava o desconto no pedido (automático + cupom), sem passar do valor dos itens
CREATE OR REPLACE FUNCTION public.order_refresh_discount(_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_items numeric;
BEGIN
  SELECT * INTO r FROM public.order_promo_discount(_order);
  SELECT COALESCE(sum(quantity * unit_price), 0) INTO v_items FROM public.order_items WHERE order_id = _order AND status <> 'cancelled';
  UPDATE public.orders o SET
    promo_discount = COALESCE(r.discount, 0),
    promo_labels = r.labels,
    discount = LEAST(COALESCE(r.discount, 0) + o.coupon_discount, v_items)
  WHERE o.id = _order
    AND (o.promo_discount IS DISTINCT FROM COALESCE(r.discount, 0) OR o.promo_labels IS DISTINCT FROM r.labels
         OR o.discount IS DISTINCT FROM LEAST(COALESCE(r.discount, 0) + o.coupon_discount, v_items));
END $$;

CREATE OR REPLACE FUNCTION public.order_items_refresh_discount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_offline_sync() THEN RETURN NULL; END IF; -- a central já mandou o desconto calculado
  PERFORM public.order_refresh_discount(COALESCE(NEW.order_id, OLD.order_id));
  IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN PERFORM public.order_refresh_discount(OLD.order_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS order_items_refresh_discount ON public.order_items;
CREATE TRIGGER order_items_refresh_discount AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_price, status, order_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_refresh_discount();

-- cupom: confere e calcula (usado na loja online e na prévia da sacola)
CREATE OR REPLACE FUNCTION public.coupon_check(_restaurant_id uuid, _code text, _subtotal numeric, _fee numeric, _user_id uuid, _phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.promotions%ROWTYPE;
  v_code text := upper(btrim(COALESCE(_code, '')));
  v_used integer;
  v_mine integer;
  v_discount numeric := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_code = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Digite o cupom.'); END IF;
  SELECT * INTO p FROM public.promotions WHERE restaurant_id = _restaurant_id AND kind = 'coupon' AND code = v_code;
  IF NOT FOUND OR NOT p.active THEN RETURN jsonb_build_object('ok', false, 'error', 'Cupom inválido.'); END IF;
  IF NOT ('delivery' = ANY(p.channels)) THEN RETURN jsonb_build_object('ok', false, 'error', 'Este cupom não vale na loja online.'); END IF;
  IF (p.starts_on IS NOT NULL AND p.starts_on > v_today) OR (p.ends_on IS NOT NULL AND p.ends_on < v_today)
     OR NOT public.in_time_window(p.days, p.time_from, p.time_to, now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este cupom não está valendo agora.');
  END IF;
  IF COALESCE(_subtotal, 0) < p.min_order THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom válido para pedidos a partir de R$ ' || replace(to_char(p.min_order, 'FM999990.00'), '.', ',') || '.');
  END IF;
  IF p.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.coupon_redemptions WHERE promotion_id = p.id;
    IF v_used >= p.max_uses THEN RETURN jsonb_build_object('ok', false, 'error', 'Este cupom já esgotou.'); END IF;
  END IF;
  IF p.per_customer IS NOT NULL AND (_user_id IS NOT NULL OR COALESCE(_phone, '') <> '') THEN
    SELECT count(*) INTO v_mine FROM public.coupon_redemptions
     WHERE promotion_id = p.id AND ((_user_id IS NOT NULL AND customer_user_id = _user_id) OR (COALESCE(_phone, '') <> '' AND customer_phone = _phone));
    IF v_mine >= p.per_customer THEN RETURN jsonb_build_object('ok', false, 'error', 'Você já usou este cupom.'); END IF;
  END IF;
  v_discount := CASE p.discount_type
    WHEN 'percent' THEN round(COALESCE(_subtotal, 0) * p.percent / 100, 2)
    WHEN 'amount' THEN LEAST(p.amount, COALESCE(_subtotal, 0))
    ELSE 0 END;
  RETURN jsonb_build_object('ok', true, 'id', p.id, 'code', p.code, 'name', p.name, 'discount_type', p.discount_type,
    'discount', v_discount, 'free_delivery', p.discount_type = 'free_delivery',
    'label', CASE p.discount_type WHEN 'percent' THEN trim(to_char(p.percent, 'FM990.##')) || '% de desconto'
                                  WHEN 'amount' THEN 'R$ ' || replace(to_char(p.amount, 'FM999990.00'), '.', ',') || ' de desconto'
                                  ELSE 'Entrega grátis' END);
END $$;

-- loja online: aplica o cupom no pedido (depois dos itens, para conferir o pedido mínimo)
DO $$
DECLARE d text := pg_get_functiondef('public.create_online_order'::regproc);
BEGIN
  IF position('coupon_check' in d) = 0 THEN
    d := replace(d, '  v_cashback numeric;', '  v_cashback numeric;' || chr(10) || '  v_coupon jsonb;');
    d := replace(d, '  UPDATE public.orders SET total = v_subtotal WHERE id = v_order;',
'  UPDATE public.orders SET total = v_subtotal WHERE id = v_order;

  -- cupom de desconto
  IF COALESCE(btrim(_order->>''coupon''), '''') <> '''' THEN
    v_coupon := public.coupon_check(v_store.restaurant_id, _order->>''coupon'', v_subtotal, v_fee, _user_id, v_phone);
    IF NOT (v_coupon->>''ok'')::boolean THEN RAISE EXCEPTION ''%'', v_coupon->>''error''; END IF;
    IF (v_coupon->>''free_delivery'')::boolean THEN v_fee := 0; END IF;
    UPDATE public.orders SET coupon_code = v_coupon->>''code'', coupon_discount = (v_coupon->>''discount'')::numeric,
           delivery_fee = v_fee WHERE id = v_order;
    INSERT INTO public.coupon_redemptions (restaurant_id, promotion_id, order_id, customer_user_id, customer_phone, discount)
    VALUES (v_store.restaurant_id, (v_coupon->>''id'')::uuid, v_order, _user_id, v_phone, (v_coupon->>''discount'')::numeric);
    PERFORM public.order_refresh_discount(v_order);
  END IF;');
    -- cashback abate do que sobra depois do desconto
    d := replace(d, 'v_cashback := LEAST(COALESCE(v_acc.cashback_balance, 0), v_subtotal + v_fee);',
      'v_cashback := LEAST(COALESCE(v_acc.cashback_balance, 0), v_subtotal + v_fee - (SELECT discount FROM public.orders WHERE id = v_order));');
    EXECUTE d;
  END IF;
END $$;

-- conta paga, recibo e NFC-e com o desconto
DO $$
DECLARE d text := pg_get_functiondef('public.on_payment_recorded'::regproc);
BEGIN
  IF position('v_order.discount' in d) = 0 THEN
    d := replace(d, 'IF v_paid + 0.009 < GREATEST(v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), COALESCE(v_order.total, 0)) THEN',
      'IF v_paid + 0.009 < GREATEST(v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), COALESCE(v_order.total, 0)) - COALESCE(v_order.discount, 0) THEN');
    d := replace(d, 'v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), 0,
            v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0),',
      'v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), COALESCE(v_order.discount, 0),
            v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0) - COALESCE(v_order.discount, 0),');
    EXECUTE d;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.print_order_header(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object(
    'id', o.id, 'created_at', o.created_at, 'order_type', o.order_type, 'table_number', t.number,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone, 'customer_address', o.customer_address,
    'notes', o.notes, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'service_fee', o.service_fee, 'couvert_total', o.couvert_total, 'people_count', o.people_count,
    'service_percent', s.service_percent, 'couvert_label', s.couvert_label,
    'discount', o.discount, 'discount_label', concat_ws(' · ', o.promo_labels, CASE WHEN o.coupon_code IS NOT NULL THEN 'Cupom ' || o.coupon_code END),
    'created_by_name', o.created_by_name, 'created_by_role', o.created_by_role, 'source', o.source)
  FROM public.orders o
  LEFT JOIN public.restaurant_tables t ON t.id = o.table_id
  LEFT JOIN public.service_settings s ON s.restaurant_id = o.restaurant_id
  WHERE o.id = _order_id
$function$;

-- central offline também recebe as promoções
DO $$
DECLARE d text := pg_get_functiondef('public.offline_replica'::regproc);
BEGIN
  IF position('''promotions''' in d) = 0 THEN
    d := replace(d, '''menu_option_groups'', ''menu_options''];', '''menu_option_groups'', ''menu_options'', ''promotions''];');
    d := replace(d, '''menu_option_groups'', (SELECT',
      '''promotions'', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.promotions t WHERE t.restaurant_id = _restaurant_id),' || chr(10) ||
      '      ''menu_option_groups'', (SELECT');
    EXECUTE d;
  END IF;
END $$;

-- quem tem a tela Promoções liberada para editar (marketing por padrão) também grava
CREATE POLICY "Module editors can manage promotions" ON public.promotions FOR ALL TO authenticated
  USING (has_module_access((SELECT auth.uid()), restaurant_id, 'promotions', true) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_module_access((SELECT auth.uid()), restaurant_id, 'promotions', true) AND is_restaurant_active(restaurant_id));
DO $$
DECLARE d text := pg_get_functiondef('public.has_module_access(uuid,uuid,text,boolean)'::regprocedure);
BEGIN
  IF position('''promotions''' in d) = 0 THEN
    d := replace(d, 'WHEN _module = ''marketing'' AND public.has_role(_user_id, ''marketing'') THEN true',
      'WHEN _module IN (''marketing'', ''promotions'') AND public.has_role(_user_id, ''marketing'') THEN true');
    EXECUTE d;
  END IF;
END $$;

-- a nuvem recalcula o desconto também nos itens que chegam da central (mesma regra, pelo horário de cada item)
CREATE OR REPLACE FUNCTION public.order_items_refresh_discount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.order_refresh_discount(COALESCE(NEW.order_id, OLD.order_id));
  IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN PERFORM public.order_refresh_discount(OLD.order_id); END IF;
  RETURN NULL;
END $$;

-- funções internas (cupom, promoções, opções): só o servidor chama
REVOKE EXECUTE ON FUNCTION public.coupon_check(uuid, text, numeric, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_refresh_discount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_promo_discount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.menu_item_quote(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_item_options_text() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_items_refresh_discount() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_check(uuid, text, numeric, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_refresh_discount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_promo_discount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.menu_item_quote(uuid, jsonb) TO service_role;
