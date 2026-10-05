-- Fidelidade de verdade (pontos, cashback ou selos acumulam quando a conta é paga) e avaliação pós-pedido (NPS).

-- ---------- telefone do cliente: a "chave" da conta de fidelidade ----------
CREATE OR REPLACE FUNCTION public.norm_phone(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) < 10 THEN NULL
    WHEN length(d) IN (10, 11) THEN '55' || d
    ELSE d END
  FROM (SELECT NULLIF(regexp_replace(COALESCE(_v, ''), '\D', '', 'g'), '') AS d) x
$$;

-- contas antigas com o telefone no mesmo formato
UPDATE public.loyalty_accounts SET customer_phone = public.norm_phone(customer_phone)
 WHERE customer_phone IS NOT NULL AND customer_phone IS DISTINCT FROM public.norm_phone(customer_phone);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_phone_uniq ON public.loyalty_accounts (restaurant_id, customer_phone)
  WHERE customer_phone IS NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_awarded_at timestamptz;

-- saldo só muda pelo sistema (antes qualquer pessoa da equipe conseguia alterar o saldo direto)
DROP POLICY IF EXISTS loyalty_accounts_write ON public.loyalty_accounts;
CREATE POLICY loyalty_accounts_write ON public.loyalty_accounts FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'loyalty', true) AND is_restaurant_active(restaurant_id))
  WITH CHECK (public.module_guard(restaurant_id, 'loyalty', true) AND is_restaurant_active(restaurant_id));
DROP POLICY IF EXISTS loyalty_transactions_insert ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_insert ON public.loyalty_transactions FOR INSERT TO authenticated
  WITH CHECK (public.module_guard(restaurant_id, 'loyalty', true) AND is_restaurant_active(restaurant_id));

-- ---------- acúmulo: chamado quando a conta fica paga ----------
CREATE OR REPLACE FUNCTION public.loyalty_award_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  p public.loyalty_programs%ROWTYPE;
  v_phone text;
  v_base numeric;
  v_mult numeric := 1;
  v_points numeric := 0;
  v_cash numeric := 0;
  v_stamps integer := 0;
  v_acc uuid;
  v_desc text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.loyalty_awarded_at IS NOT NULL THEN RETURN; END IF;
  v_phone := public.norm_phone(o.customer_phone);
  IF v_phone IS NULL OR NOT public.restaurant_has_feature(o.restaurant_id, 'loyalty') THEN RETURN; END IF;
  SELECT * INTO p FROM public.loyalty_programs WHERE restaurant_id = o.restaurant_id AND enabled;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (COALESCE(o.order_type, 'dine_in') = ANY(p.channels)
          OR (o.order_type = 'takeaway' AND 'counter' = ANY(p.channels))) THEN RETURN; END IF;

  -- base: consumo (sem taxa de entrega, serviço e couvert) menos o que foi pago com cashback
  SELECT COALESCE(sum(quantity * unit_price), 0) INTO v_base FROM public.order_items WHERE order_id = o.id AND status <> 'cancelled';
  v_base := v_base - (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE order_id = o.id AND method = 'cashback');
  IF v_base <= 0 OR v_base < COALESCE(p.min_order_value, 0) THEN RETURN; END IF;

  BEGIN
    v_mult := COALESCE(NULLIF(p.weekday_multipliers ->> extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int::text, '')::numeric, 1);
  EXCEPTION WHEN OTHERS THEN v_mult := 1;
  END;

  IF p.mode = 'cashback' THEN
    v_cash := round(v_base * p.cashback_percent / 100 * v_mult, 2);
    v_desc := format('Cashback de %s%% sobre R$ %s', p.cashback_percent, replace(to_char(v_base, 'FM999999990.00'), '.', ','));
  ELSIF p.mode = 'stamps' THEN
    v_stamps := 1;
    v_desc := 'Selo do cartão fidelidade';
  ELSE
    v_points := floor(v_base * p.points_per_currency * v_mult);
    v_desc := format('%s pontos sobre R$ %s', v_points, replace(to_char(v_base, 'FM999999990.00'), '.', ','));
  END IF;
  IF v_cash <= 0 AND v_points <= 0 AND v_stamps <= 0 THEN RETURN; END IF;

  SELECT id INTO v_acc FROM public.loyalty_accounts WHERE restaurant_id = o.restaurant_id AND customer_phone = v_phone FOR UPDATE;
  IF v_acc IS NULL THEN
    INSERT INTO public.loyalty_accounts (restaurant_id, customer_id, customer_name, customer_phone)
    VALUES (o.restaurant_id,
            (SELECT c.id FROM public.customers c WHERE c.restaurant_id = o.restaurant_id AND public.norm_phone(c.phone) = v_phone LIMIT 1),
            COALESCE(NULLIF(trim(o.customer_name), ''), 'Cliente'), v_phone)
    RETURNING id INTO v_acc;
  END IF;

  UPDATE public.loyalty_accounts SET
    points_balance = points_balance + v_points,
    cashback_balance = cashback_balance + v_cash,
    stamps = stamps + v_stamps,
    total_earned = total_earned + CASE WHEN v_cash > 0 THEN v_cash ELSE v_points END,
    customer_name = COALESCE(NULLIF(trim(o.customer_name), ''), customer_name)
  WHERE id = v_acc;

  INSERT INTO public.loyalty_transactions (restaurant_id, account_id, order_id, type, points, amount, description)
  VALUES (o.restaurant_id, v_acc, o.id, 'earn', v_points + v_stamps, v_cash, v_desc);

  UPDATE public.orders SET loyalty_awarded_at = now() WHERE id = o.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_award_order(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- cashback como forma de pagamento ----------
CREATE OR REPLACE FUNCTION public.loyalty_cashback_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid;
  v_phone text;
  v_acc public.loyalty_accounts%ROWTYPE;
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.method::text <> 'cashback' THEN RETURN NEW; END IF;
    SELECT restaurant_id, public.norm_phone(customer_phone) INTO v_rid, v_phone FROM public.orders WHERE id = NEW.order_id;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'Informe o telefone do cliente para usar o cashback.'; END IF;
    SELECT * INTO v_acc FROM public.loyalty_accounts WHERE restaurant_id = v_rid AND customer_phone = v_phone FOR UPDATE;
    IF NOT FOUND OR v_acc.cashback_balance + 0.009 < NEW.amount THEN
      RAISE EXCEPTION 'Saldo de cashback insuficiente (disponível: R$ %).',
        replace(to_char(COALESCE(v_acc.cashback_balance, 0), 'FM999999990.00'), '.', ',');
    END IF;
    UPDATE public.loyalty_accounts SET cashback_balance = cashback_balance - NEW.amount, total_redeemed = total_redeemed + NEW.amount
     WHERE id = v_acc.id;
    INSERT INTO public.loyalty_transactions (restaurant_id, account_id, order_id, type, amount, description, user_id)
    VALUES (v_rid, v_acc.id, NEW.order_id, 'redeem', NEW.amount, 'Cashback usado no pagamento', NEW.user_id);
    RETURN NEW;
  END IF;
  -- pagamento em cashback estornado: devolve o saldo
  IF OLD.method::text = 'cashback' THEN
    SELECT restaurant_id, public.norm_phone(customer_phone) INTO v_rid, v_phone FROM public.orders WHERE id = OLD.order_id;
    UPDATE public.loyalty_accounts SET cashback_balance = cashback_balance + OLD.amount, total_redeemed = GREATEST(total_redeemed - OLD.amount, 0)
     WHERE restaurant_id = v_rid AND customer_phone = v_phone
     RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO public.loyalty_transactions (restaurant_id, account_id, order_id, type, amount, description)
      VALUES (v_rid, v_id, OLD.order_id, 'adjust', OLD.amount, 'Estorno de pagamento em cashback');
    END IF;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_cashback_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_loyalty_cashback_payment ON public.payments;
CREATE TRIGGER trg_loyalty_cashback_payment BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.loyalty_cashback_payment();
DROP TRIGGER IF EXISTS trg_loyalty_cashback_refund ON public.payments;
CREATE TRIGGER trg_loyalty_cashback_refund AFTER DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.loyalty_cashback_payment();

-- Saldo do cliente para o caixa (qualquer pessoa da equipe da loja ativa).
CREATE OR REPLACE FUNCTION public.loyalty_lookup(_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid := public.get_user_restaurant_id(auth.uid());
  v_phone text := public.norm_phone(_phone);
  a public.loyalty_accounts%ROWTYPE;
  p public.loyalty_programs%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR NOT public.user_belongs_to_restaurant(auth.uid(), v_rid) THEN RAISE EXCEPTION 'Sem acesso.'; END IF;
  SELECT * INTO p FROM public.loyalty_programs WHERE restaurant_id = v_rid;
  IF v_phone IS NULL THEN RETURN jsonb_build_object('found', false, 'enabled', COALESCE(p.enabled, false), 'mode', p.mode); END IF;
  SELECT * INTO a FROM public.loyalty_accounts WHERE restaurant_id = v_rid AND customer_phone = v_phone;
  RETURN jsonb_build_object(
    'found', FOUND, 'enabled', COALESCE(p.enabled, false) AND public.restaurant_has_feature(v_rid, 'loyalty'),
    'mode', p.mode, 'phone', v_phone, 'name', a.customer_name,
    'cashback', COALESCE(a.cashback_balance, 0), 'points', COALESCE(a.points_balance, 0), 'stamps', COALESCE(a.stamps, 0),
    'stamps_required', p.stamps_required, 'cashback_percent', p.cashback_percent);
END $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_lookup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_lookup(text) TO authenticated;

-- ---------- avaliação pós-pedido (NPS) ----------
CREATE TABLE IF NOT EXISTS public.feedback_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  print_on_receipt boolean NOT NULL DEFAULT true,
  alert_score smallint NOT NULL DEFAULT 6 CHECK (alert_score BETWEEN 0 AND 10),
  thank_you text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_settings_read ON public.feedback_settings;
CREATE POLICY feedback_settings_read ON public.feedback_settings FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
DROP POLICY IF EXISTS feedback_settings_manage ON public.feedback_settings;
CREATE POLICY feedback_settings_manage ON public.feedback_settings FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 10),
  food_score smallint CHECK (food_score BETWEEN 1 AND 5),
  service_score smallint CHECK (service_score BETWEEN 1 AND 5),
  speed_score smallint CHECK (speed_score BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 1000),
  customer_name text,
  customer_phone text,
  order_type text,
  replied_at timestamptz,
  reply text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_reviews_restaurant_created ON public.order_reviews (restaurant_id, created_at DESC);
ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_reviews_read ON public.order_reviews;
CREATE POLICY order_reviews_read ON public.order_reviews FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.restaurant_id = order_reviews.restaurant_id
                    AND ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'finance'::app_role])));
DROP POLICY IF EXISTS order_reviews_reply ON public.order_reviews;
CREATE POLICY order_reviews_reply ON public.order_reviews FOR UPDATE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())));

-- Na avaliação só a resposta da loja muda.
CREATE OR REPLACE FUNCTION public.guard_order_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- sistema
  NEW := jsonb_populate_record(OLD, jsonb_build_object('reply', NEW.reply, 'replied_at', CASE WHEN NEW.reply IS DISTINCT FROM OLD.reply THEN now() ELSE OLD.replied_at END));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_order_review ON public.order_reviews;
CREATE TRIGGER trg_guard_order_review BEFORE UPDATE ON public.order_reviews FOR EACH ROW EXECUTE FUNCTION public.guard_order_review();

-- Página pública de avaliação (pelo código do pedido): dados para mostrar e gravar a nota.
CREATE OR REPLACE FUNCTION public.review_info(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'order_id', o.id, 'code', upper(left(o.id::text, 8)), 'created_at', o.created_at, 'order_type', o.order_type,
    'customer_name', o.customer_name,
    'restaurant', COALESCE(NULLIF(trim(b.brand_name), ''), r.name),
    'logo', COALESCE(b.logo_light_url, b.logo_dark_url),
    'enabled', COALESCE(f.enabled, true), 'thank_you', f.thank_you,
    'review', (SELECT jsonb_build_object('score', v.score, 'comment', v.comment, 'reply', v.reply, 'created_at', v.created_at)
                 FROM public.order_reviews v WHERE v.order_id = o.id),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', COALESCE(m.name, 'Item'), 'quantity', oi.quantity) ORDER BY oi.created_at), '[]')
                FROM public.order_items oi LEFT JOIN public.menu_items m ON m.id = oi.menu_item_id
               WHERE oi.order_id = o.id AND oi.status <> 'cancelled'))
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.branding_settings b ON b.restaurant_id = o.restaurant_id
  LEFT JOIN public.feedback_settings f ON f.restaurant_id = o.restaurant_id
  WHERE o.public_token = _token AND o.status <> 'cancelled'
$$;
REVOKE EXECUTE ON FUNCTION public.review_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_info(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_review(_token uuid, _score int, _comment text, _food int, _service int, _speed int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_alert smallint;
  v_enabled boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE public_token = _token AND status <> 'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  SELECT COALESCE(enabled, true), COALESCE(alert_score, 6) INTO v_enabled, v_alert FROM public.feedback_settings WHERE restaurant_id = o.restaurant_id;
  IF v_enabled IS FALSE THEN RAISE EXCEPTION 'Esta loja não está recebendo avaliações.'; END IF;
  IF _score IS NULL OR _score < 0 OR _score > 10 THEN RAISE EXCEPTION 'Escolha uma nota de 0 a 10.'; END IF;
  IF o.created_at < now() - interval '30 days' THEN RAISE EXCEPTION 'O prazo para avaliar este pedido terminou.'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_reviews WHERE order_id = o.id) THEN RAISE EXCEPTION 'Este pedido já foi avaliado. Obrigado!'; END IF;

  INSERT INTO public.order_reviews (restaurant_id, order_id, score, food_score, service_score, speed_score, comment, customer_name, customer_phone, order_type)
  VALUES (o.restaurant_id, o.id, _score,
          CASE WHEN _food BETWEEN 1 AND 5 THEN _food END, CASE WHEN _service BETWEEN 1 AND 5 THEN _service END,
          CASE WHEN _speed BETWEEN 1 AND 5 THEN _speed END,
          NULLIF(left(trim(COALESCE(_comment, '')), 1000), ''), o.customer_name, public.norm_phone(o.customer_phone), o.order_type);

  IF _score <= COALESCE(v_alert, 6) THEN
    INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
    VALUES (o.restaurant_id, 'Avaliação baixa recebida',
            format('Nota %s no pedido #%s%s%s', _score, upper(left(o.id::text, 8)),
                   CASE WHEN o.customer_name IS NOT NULL THEN ' de ' || o.customer_name ELSE '' END,
                   CASE WHEN NULLIF(trim(COALESCE(_comment, '')), '') IS NOT NULL THEN ': "' || left(trim(_comment), 140) || '"' ELSE '' END),
            'review', ARRAY['admin']);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_review(uuid, int, text, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, int, text, int, int, int) TO service_role;

-- ---------- código público em todo pedido (acompanhamento e link de avaliação) ----------
ALTER TABLE public.orders ALTER COLUMN public_token SET DEFAULT gen_random_uuid();
UPDATE public.orders SET public_token = gen_random_uuid() WHERE public_token IS NULL AND created_at > now() - interval '30 days';

-- Link da avaliação impresso no recibo (null quando a loja desligou).
CREATE OR REPLACE FUNCTION public.review_url(_order_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'https://www.oxysrestaurante.app/avaliar/' || o.public_token
    FROM public.orders o LEFT JOIN public.feedback_settings f ON f.restaurant_id = o.restaurant_id
   WHERE o.id = _order_id AND o.public_token IS NOT NULL AND COALESCE(f.enabled, true) AND COALESCE(f.print_on_receipt, true)
$$;
REVOKE EXECUTE ON FUNCTION public.review_url(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- pagamento: link de avaliação no recibo e acúmulo da fidelidade ----------
DO $$
DECLARE d text; a text; b text; c text; e text;
BEGIN
  SELECT pg_get_functiondef('public.on_payment_recorded()'::regprocedure) INTO d;
  IF position('loyalty_award_order' in d) > 0 THEN RETURN; END IF;
  -- recibo leva o link da avaliação
  a := $x$      'change', (SELECT COALESCE(sum(change_amount), 0) FROM public.payments p WHERE p.order_id = NEW.order_id));$x$;
  b := $x$      'change', (SELECT COALESCE(sum(change_amount), 0) FROM public.payments p WHERE p.order_id = NEW.order_id),
      'review_url', public.review_url(NEW.order_id));$x$;
  c := $x$  SELECT * INTO v_profile FROM public.fiscal_profiles$x$;
  e := $x$  PERFORM public.loyalty_award_order(NEW.order_id);

  SELECT * INTO v_profile FROM public.fiscal_profiles$x$;
  IF position(a in d) = 0 OR position(c in d) = 0 THEN RAISE EXCEPTION 'on_payment_recorded: trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a, b), c, e);
END $$;
REVOKE EXECUTE ON FUNCTION public.on_payment_recorded() FROM PUBLIC, anon, authenticated;
