-- Salão e bar: comanda por cartão/pulseira, consumação mínima, comissão do garçom, fila de espera e reserva online.

-- comanda individual: número do cartão/pulseira, único entre as comandas abertas da loja
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS card_code text CHECK (card_code IS NULL OR card_code ~ '^[A-Za-z0-9-]{1,12}$'),
  ADD COLUMN IF NOT EXISTS min_consumption_total numeric(10,2);
CREATE UNIQUE INDEX IF NOT EXISTS orders_open_card_uniq ON public.orders (restaurant_id, upper(card_code))
  WHERE card_code IS NOT NULL AND archived_at IS NULL AND status <> 'cancelled';

ALTER TABLE public.service_settings
  ADD COLUMN IF NOT EXISTS min_consumption_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_consumption_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_consumption_amount >= 0),
  ADD COLUMN IF NOT EXISTS waiter_commission_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (waiter_commission_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS waiter_commission_base text NOT NULL DEFAULT 'service' CHECK (waiter_commission_base IN ('service', 'sales'));

-- conta paga, recibo e NFC-e com a consumação mínima
DO $$
DECLARE d text := pg_get_functiondef('public.on_payment_recorded'::regproc);
BEGIN
  IF position('min_consumption_total' in d) = 0 THEN
    d := replace(d, 'COALESCE(v_order.couvert_total, 0)', 'COALESCE(v_order.couvert_total, 0) + COALESCE(v_order.min_consumption_total, 0)');
    EXECUTE d;
  END IF;
END $$;

DO $$
DECLARE d text := pg_get_functiondef('public.print_order_header(uuid)'::regprocedure);
BEGIN
  IF position('min_consumption_total' in d) = 0 THEN
    d := replace(d, '''people_count'', o.people_count,', '''people_count'', o.people_count, ''min_consumption_total'', o.min_consumption_total, ''card_code'', o.card_code,');
    EXECUTE d;
  END IF;
END $$;

-- fila de espera
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  phone text,
  party_size integer NOT NULL DEFAULT 2 CHECK (party_size BETWEEN 1 AND 50),
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'seated', 'cancelled', 'no_show')),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'online')),
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  seated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_restaurant_idx ON public.waitlist (restaurant_id, status, created_at);
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view waitlist" ON public.waitlist FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));
CREATE POLICY "Floor staff manage waitlist" ON public.waitlist FOR ALL TO authenticated
  USING (restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id)
         AND (has_role((SELECT auth.uid()), 'admin') OR has_role((SELECT auth.uid()), 'waiter') OR has_role((SELECT auth.uid()), 'cashier')))
  WITH CHECK (restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id)
         AND (has_role((SELECT auth.uid()), 'admin') OR has_role((SELECT auth.uid()), 'waiter') OR has_role((SELECT auth.uid()), 'cashier')));
CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER offline_hub_notify AFTER INSERT OR DELETE OR UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION notify_offline_hub_change();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'waitlist') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
  END IF;
END $$;

-- reserva online (página pública /reservar/<endereço>)
CREATE TABLE IF NOT EXISTS public.booking_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  online_enabled boolean NOT NULL DEFAULT false,
  waitlist_online boolean NOT NULL DEFAULT false,
  duration_minutes integer NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 30 AND 480),
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 60)),
  min_party integer NOT NULL DEFAULT 1 CHECK (min_party >= 1),
  max_party integer NOT NULL DEFAULT 12 CHECK (max_party BETWEEN 1 AND 50),
  advance_days integer NOT NULL DEFAULT 30 CHECK (advance_days BETWEEN 0 AND 365),
  min_notice_minutes integer NOT NULL DEFAULT 60 CHECK (min_notice_minutes >= 0),
  -- {"0": ["18:00","23:00"], "5": ["11:30","15:00"], ...}  (0 = domingo); dia ausente = fechado
  hours jsonb NOT NULL DEFAULT '{}',
  notice text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view booking settings" ON public.booking_settings FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
CREATE POLICY "Admins manage booking settings" ON public.booking_settings FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin') AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));
CREATE TRIGGER update_booking_settings_updated_at BEFORE UPDATE ON public.booking_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff';

-- mesa livre para a reserva online: cabe o grupo e não tem outra reserva confirmada no horário
CREATE OR REPLACE FUNCTION public.book_online(_restaurant_id uuid, _date date, _time time, _party integer, _name text, _phone text, _notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.booking_settings%ROWTYPE;
  v_end time;
  v_table uuid;
  v_id uuid;
  v_local timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hours jsonb;
BEGIN
  SELECT * INTO s FROM public.booking_settings WHERE restaurant_id = _restaurant_id AND online_enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'A reserva online não está ativa nesta loja.'; END IF;
  IF length(btrim(COALESCE(_name, ''))) < 2 THEN RAISE EXCEPTION 'Informe seu nome.'; END IF;
  IF length(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g')) < 10 THEN RAISE EXCEPTION 'Informe um WhatsApp com DDD.'; END IF;
  IF _party < s.min_party OR _party > s.max_party THEN
    RAISE EXCEPTION 'Reservas online de % a % pessoas. Para grupos maiores, fale com a loja.', s.min_party, s.max_party;
  END IF;
  IF (_date + _time) < v_local + make_interval(mins => s.min_notice_minutes) THEN RAISE EXCEPTION 'Escolha um horário com mais antecedência.'; END IF;
  IF _date > v_local::date + s.advance_days THEN RAISE EXCEPTION 'Reservas só até % dias à frente.', s.advance_days; END IF;
  v_hours := s.hours -> extract(dow FROM _date)::text;
  IF v_hours IS NULL OR _time < (v_hours->>0)::time OR _time > (v_hours->>1)::time THEN RAISE EXCEPTION 'A loja não recebe reservas nesse horário.'; END IF;
  -- limite de abuso: no máximo 3 reservas online por telefone por dia
  IF (SELECT count(*) FROM public.reservations r WHERE r.restaurant_id = _restaurant_id AND r.source = 'online'
        AND regexp_replace(COALESCE(r.customer_phone, ''), '\D', '', 'g') = regexp_replace(_phone, '\D', '', 'g')
        AND r.created_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'Muitas reservas para este telefone. Fale com a loja.';
  END IF;
  v_end := (_time + make_interval(mins => s.duration_minutes))::time;
  SELECT t.id INTO v_table FROM public.restaurant_tables t
   WHERE t.restaurant_id = _restaurant_id AND t.capacity >= _party
     AND NOT EXISTS (SELECT 1 FROM public.reservations r WHERE r.table_id = t.id AND r.status = 'confirmed' AND r.reservation_date = _date
                      AND r.start_time < v_end AND r.end_time > _time)
   ORDER BY t.capacity, t.number LIMIT 1;
  IF v_table IS NULL THEN RAISE EXCEPTION 'Não há mesa livre para % pessoa(s) nesse horário. Tente outro horário.', _party; END IF;
  INSERT INTO public.reservations (restaurant_id, table_id, customer_name, customer_phone, reservation_date, start_time, end_time, party_size, status, notes, source)
  VALUES (_restaurant_id, v_table, btrim(_name), _phone, _date, _time, v_end, _party, 'confirmed', NULLIF(left(btrim(COALESCE(_notes, '')), 300), ''), 'online')
  RETURNING id INTO v_id;
  INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
  VALUES (_restaurant_id, 'Nova reserva online',
          btrim(_name) || ' · ' || _party || ' pessoa(s) · ' || to_char(_date, 'DD/MM') || ' às ' || to_char(_time, 'HH24:MI'),
          'reservation', ARRAY['admin', 'waiter']);
  RETURN jsonb_build_object('id', v_id, 'table', (SELECT number FROM public.restaurant_tables WHERE id = v_table), 'end', to_char(v_end, 'HH24:MI'));
END $$;
REVOKE EXECUTE ON FUNCTION public.book_online(uuid, date, time, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_online(uuid, date, time, integer, text, text, text) TO service_role;

-- central offline: fila de espera também sem internet
DO $$
DECLARE d text := pg_get_functiondef('public.offline_replica'::regproc);
BEGIN
  IF position('''waitlist''' in d) = 0 THEN
    d := replace(d, '''promotions''];', '''promotions'', ''waitlist''];');
    d := replace(d, '''promotions'', (SELECT',
      '''waitlist'', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.waitlist t WHERE t.restaurant_id = _restaurant_id AND t.created_at > now() - interval ''2 days''),' || chr(10) ||
      '      ''promotions'', (SELECT');
    EXECUTE d;
  END IF;
END $$;
