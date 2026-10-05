-- Balanço de estoque: contagem periódica comparada com o estoque do sistema, com relatório final preenchido pelo
-- responsável. Em filial, o balanço é do gerente/supervisor e a matriz é avisada e vê o relatório.

-- ---------- agenda ----------
CREATE TABLE IF NOT EXISTS public.stock_count_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'none' CHECK (frequency IN ('none', 'weekly', 'biweekly', 'monthly')),
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),     -- semanal/quinzenal (0 = domingo)
  month_day smallint NOT NULL DEFAULT 1 CHECK (month_day BETWEEN 1 AND 28), -- mensal
  blind_count boolean NOT NULL DEFAULT true,                                 -- quem conta não vê o número do sistema
  next_due_date date,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- balanços ----------
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'counting', 'closed', 'cancelled')),
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'scheduled')),
  due_date date,
  blind_count boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  started_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  responsible_name text,
  responsible_role text,
  general_notes text,
  signature text,
  stock_adjusted boolean NOT NULL DEFAULT false,
  items_total integer NOT NULL DEFAULT 0,
  items_divergent integer NOT NULL DEFAULT 0,
  value_system numeric NOT NULL DEFAULT 0,
  value_counted numeric NOT NULL DEFAULT 0,
  value_difference numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_counts_restaurant_idx ON public.stock_counts (restaurant_id, created_at DESC);
-- um balanço em andamento (ou agendado) por loja
CREATE UNIQUE INDEX IF NOT EXISTS stock_counts_one_open ON public.stock_counts (restaurant_id) WHERE status IN ('scheduled', 'counting');

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text,
  system_quantity numeric NOT NULL,          -- estoque do sistema quando a contagem começou
  cost_per_unit numeric NOT NULL DEFAULT 0,
  counted_quantity numeric,
  reason text CHECK (reason IS NULL OR reason IN ('loss', 'expired', 'entry_error', 'internal_use', 'theft', 'unregistered_entry', 'other')),
  justification text,
  counted_by uuid,
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, inventory_id)
);
CREATE INDEX IF NOT EXISTS stock_count_items_count_idx ON public.stock_count_items (count_id);

DROP TRIGGER IF EXISTS update_stock_counts_updated_at ON public.stock_counts;
CREATE TRIGGER update_stock_counts_updated_at BEFORE UPDATE ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_stock_count_items_updated_at ON public.stock_count_items;
CREATE TRIGGER update_stock_count_items_updated_at BEFORE UPDATE ON public.stock_count_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- acesso: quem cuida do estoque (admin/gerente/supervisor e financeiro) faz o balanço ----------
ALTER TABLE public.stock_count_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_count_settings_read ON public.stock_count_settings;
CREATE POLICY stock_count_settings_read ON public.stock_count_settings FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
DROP POLICY IF EXISTS stock_count_settings_manage ON public.stock_count_settings;
CREATE POLICY stock_count_settings_manage ON public.stock_count_settings FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));

-- leitura: todas as lojas em que a pessoa tem cargo (o dono vê os balanços das filiais a partir da matriz)
DROP POLICY IF EXISTS stock_counts_read ON public.stock_counts;
CREATE POLICY stock_counts_read ON public.stock_counts FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.restaurant_id = stock_counts.restaurant_id
                      AND ur.role IN ('admin', 'manager', 'supervisor', 'finance')));
-- criar/cancelar: só na loja ativa (iniciar, salvar a contagem e fechar passam pelas funções abaixo)
DROP POLICY IF EXISTS stock_counts_write ON public.stock_counts;
CREATE POLICY stock_counts_write ON public.stock_counts FOR INSERT TO authenticated
  WITH CHECK ((has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'finance'::app_role))
              AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id) AND status = 'scheduled');

DROP POLICY IF EXISTS stock_count_items_read ON public.stock_count_items;
CREATE POLICY stock_count_items_read ON public.stock_count_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = stock_count_items.count_id));  -- mesmas regras do balanço
-- contagem: só enquanto o balanço está em andamento, na loja ativa
DROP POLICY IF EXISTS stock_count_items_count ON public.stock_count_items;
CREATE POLICY stock_count_items_count ON public.stock_count_items FOR UPDATE TO authenticated
  USING ((has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'finance'::app_role))
         AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
         AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = stock_count_items.count_id AND c.status = 'counting'))
  WITH CHECK ((has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'finance'::app_role))
              AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
              AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = stock_count_items.count_id AND c.status = 'counting'));

-- na contagem, só o contado, o motivo e a justificativa mudam (o número do sistema fica como estava no início)
CREATE OR REPLACE FUNCTION public.guard_stock_count_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- funções do sistema
  IF NEW.system_quantity IS DISTINCT FROM OLD.system_quantity OR NEW.cost_per_unit IS DISTINCT FROM OLD.cost_per_unit
     OR NEW.inventory_id IS DISTINCT FROM OLD.inventory_id OR NEW.count_id IS DISTINCT FROM OLD.count_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'Na contagem só o contado, o motivo e a justificativa podem mudar.' USING ERRCODE = '42501';
  END IF;
  IF NEW.counted_quantity IS DISTINCT FROM OLD.counted_quantity THEN
    IF NEW.counted_quantity < 0 THEN RAISE EXCEPTION 'Quantidade contada não pode ser negativa.'; END IF;
    NEW.counted_by := auth.uid();
    NEW.counted_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_count_items_guard ON public.stock_count_items;
CREATE TRIGGER stock_count_items_guard BEFORE UPDATE ON public.stock_count_items FOR EACH ROW EXECUTE FUNCTION public.guard_stock_count_item();

-- ---------- próxima data da agenda ----------
CREATE OR REPLACE FUNCTION public.next_stock_count_date(_frequency text, _weekday int, _month_day int, _after date)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d date;
BEGIN
  IF _frequency = 'none' THEN RETURN NULL; END IF;
  IF _frequency = 'monthly' THEN
    d := make_date(extract(year FROM _after)::int, extract(month FROM _after)::int, _month_day);
    IF d <= _after THEN d := (d + interval '1 month')::date; END IF;
    RETURN d;
  END IF;
  d := _after + 1;
  WHILE extract(dow FROM d) <> _weekday LOOP d := d + 1; END LOOP;
  IF _frequency = 'biweekly' THEN d := d + 7; END IF;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_settings_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.frequency IS DISTINCT FROM OLD.frequency OR NEW.weekday IS DISTINCT FROM OLD.weekday
     OR NEW.month_day IS DISTINCT FROM OLD.month_day THEN
    -- a partir de hoje (Brasília): o primeiro da agenda pode ser hoje mesmo
    NEW.next_due_date := public.next_stock_count_date(NEW.frequency, NEW.weekday, NEW.month_day,
                                                      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1));
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_count_settings_schedule ON public.stock_count_settings;
CREATE TRIGGER stock_count_settings_schedule BEFORE INSERT OR UPDATE ON public.stock_count_settings
  FOR EACH ROW EXECUTE FUNCTION public.stock_count_settings_schedule();

-- ---------- iniciar: congela o estoque do sistema de cada item ----------
CREATE OR REPLACE FUNCTION public.start_stock_count(_count_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rid uuid := public.get_user_restaurant_id(v_uid);
  v_count public.stock_counts%ROWTYPE;
  v_blind boolean;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finance')) OR NOT public.is_restaurant_active(v_rid) THEN
    RAISE EXCEPTION 'Sem permissão para fazer balanço nesta loja.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((SELECT blind_count FROM public.stock_count_settings WHERE restaurant_id = v_rid), true) INTO v_blind;

  IF _count_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.stock_counts WHERE restaurant_id = v_rid AND status = 'counting') THEN
      RAISE EXCEPTION 'Já existe um balanço em andamento nesta loja.';
    END IF;
    -- um agendado vira este
    SELECT * INTO v_count FROM public.stock_counts WHERE restaurant_id = v_rid AND status = 'scheduled' LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.stock_counts (restaurant_id, status, kind, due_date, blind_count)
      VALUES (v_rid, 'scheduled', 'manual', (now() AT TIME ZONE 'America/Sao_Paulo')::date, v_blind) RETURNING * INTO v_count;
    END IF;
  ELSE
    SELECT * INTO v_count FROM public.stock_counts WHERE id = _count_id AND restaurant_id = v_rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Balanço não encontrado nesta loja.'; END IF;
    IF v_count.status <> 'scheduled' THEN RAISE EXCEPTION 'Este balanço já foi iniciado.'; END IF;
  END IF;

  INSERT INTO public.stock_count_items (count_id, restaurant_id, inventory_id, name, unit, system_quantity, cost_per_unit)
  SELECT v_count.id, v_rid, i.id, i.name, i.unit, i.quantity, COALESCE(i.cost_per_unit, 0)
    FROM public.inventory i WHERE i.restaurant_id = v_rid
  ON CONFLICT (count_id, inventory_id) DO NOTHING;

  UPDATE public.stock_counts SET status = 'counting', started_at = now(), started_by = v_uid, blind_count = v_blind,
         items_total = (SELECT count(*) FROM public.stock_count_items WHERE count_id = v_count.id)
   WHERE id = v_count.id;
  RETURN v_count.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid) TO authenticated;

-- ---------- concluir: relatório do responsável, ajuste do estoque e aviso (inclusive para a matriz) ----------
CREATE OR REPLACE FUNCTION public.close_stock_count(
  _count_id uuid, _responsible_name text, _responsible_role text, _general_notes text, _signature text, _adjust boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rid uuid := public.get_user_restaurant_id(v_uid);
  v_count public.stock_counts%ROWTYPE;
  v_rest public.restaurants%ROWTYPE;
  v_pending integer;
  v_missing integer;
  r record;
  v_delta numeric;
  v_summary jsonb;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'finance')) THEN
    RAISE EXCEPTION 'Sem permissão para concluir o balanço.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_count FROM public.stock_counts WHERE id = _count_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Balanço não encontrado nesta loja.'; END IF;
  IF v_count.status <> 'counting' THEN RAISE EXCEPTION 'Este balanço não está em andamento.'; END IF;
  IF length(btrim(COALESCE(_responsible_name, ''))) < 3 THEN RAISE EXCEPTION 'Informe o nome do responsável.'; END IF;
  IF length(btrim(COALESCE(_signature, ''))) < 3 THEN RAISE EXCEPTION 'Assine o relatório digitando seu nome completo.'; END IF;

  SELECT count(*) INTO v_pending FROM public.stock_count_items WHERE count_id = _count_id AND counted_quantity IS NULL;
  IF v_pending > 0 THEN RAISE EXCEPTION 'Ainda faltam % item(ns) para contar.', v_pending; END IF;
  SELECT count(*) INTO v_missing FROM public.stock_count_items
   WHERE count_id = _count_id AND counted_quantity <> system_quantity AND (reason IS NULL OR length(btrim(COALESCE(justification, ''))) < 3);
  IF v_missing > 0 THEN RAISE EXCEPTION 'Informe o motivo e a justificativa de % item(ns) com diferença.', v_missing; END IF;

  -- ajuste: o estoque do sistema passa a ser o contado (mantendo o que foi vendido/recebido durante a contagem)
  IF _adjust THEN
    FOR r IN SELECT * FROM public.stock_count_items WHERE count_id = _count_id AND counted_quantity <> system_quantity AND inventory_id IS NOT NULL LOOP
      v_delta := r.counted_quantity - r.system_quantity;
      UPDATE public.inventory SET quantity = GREATEST(quantity + v_delta, 0) WHERE id = r.inventory_id;
      INSERT INTO public.inventory_movements (inventory_id, restaurant_id, type, quantity, reason, user_id)
      VALUES (r.inventory_id, v_rid, CASE WHEN v_delta > 0 THEN 'entry'::inventory_movement_type ELSE 'exit'::inventory_movement_type END,
              abs(v_delta), 'Ajuste de balanço de estoque', v_uid);
    END LOOP;
  END IF;

  UPDATE public.stock_counts c SET
    status = 'closed', closed_at = now(), closed_by = v_uid, stock_adjusted = COALESCE(_adjust, false),
    responsible_name = btrim(_responsible_name), responsible_role = NULLIF(btrim(COALESCE(_responsible_role, '')), ''),
    general_notes = NULLIF(btrim(COALESCE(_general_notes, '')), ''), signature = btrim(_signature),
    items_total = s.total, items_divergent = s.divergent, value_system = s.vsys, value_counted = s.vcnt, value_difference = s.vcnt - s.vsys
  FROM (SELECT count(*) AS total, count(*) FILTER (WHERE counted_quantity <> system_quantity) AS divergent,
               COALESCE(sum(system_quantity * cost_per_unit), 0) AS vsys, COALESCE(sum(counted_quantity * cost_per_unit), 0) AS vcnt
          FROM public.stock_count_items WHERE count_id = _count_id) s
  WHERE c.id = _count_id
  RETURNING jsonb_build_object('items', c.items_total, 'divergent', c.items_divergent, 'difference', c.value_difference) INTO v_summary;

  -- avisos: a loja (admin/financeiro) e, se for filial, a matriz
  SELECT * INTO v_rest FROM public.restaurants WHERE id = v_rid;
  INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
  VALUES (v_rid, 'Balanço de estoque concluído',
          format('%s: %s item(ns) com diferença (R$ %s). Responsável: %s.', v_rest.name, v_summary->>'divergent',
                 replace(to_char((v_summary->>'difference')::numeric, 'FM999999990.00'), '.', ','), btrim(_responsible_name)),
          'stock_count', ARRAY['admin', 'finance']);
  IF v_rest.parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
    VALUES (v_rest.parent_id, 'Balanço de estoque da filial',
            format('Filial %s concluiu o balanço: %s item(ns) com diferença (R$ %s). Responsável: %s.', v_rest.name, v_summary->>'divergent',
                   replace(to_char((v_summary->>'difference')::numeric, 'FM999999990.00'), '.', ','), btrim(_responsible_name)),
            'stock_count', ARRAY['admin']);
  END IF;
  RETURN v_summary;
END $$;
REVOKE EXECUTE ON FUNCTION public.close_stock_count(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_stock_count(uuid, text, text, text, text, boolean) TO authenticated;

-- cancelar um balanço que não foi concluído
CREATE OR REPLACE FUNCTION public.cancel_stock_count(_count_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Só o admin/gerente cancela um balanço.' USING ERRCODE = '42501'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled', closed_at = now(), closed_by = v_uid
   WHERE id = _count_id AND restaurant_id = public.get_user_restaurant_id(v_uid) AND status IN ('scheduled', 'counting');
  IF NOT FOUND THEN RAISE EXCEPTION 'Balanço não encontrado ou já concluído.'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid) TO authenticated;

-- ---------- agenda: todo dia cria os balanços do dia e avisa os responsáveis ----------
CREATE OR REPLACE FUNCTION public.stock_count_scheduler()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  s record;
  n integer := 0;
BEGIN
  FOR s IN SELECT st.*, r.name FROM public.stock_count_settings st JOIN public.restaurants r ON r.id = st.restaurant_id
            WHERE st.frequency <> 'none' AND st.next_due_date IS NOT NULL AND st.next_due_date <= v_today AND r.status = 'active' LOOP
    IF NOT EXISTS (SELECT 1 FROM public.stock_counts WHERE restaurant_id = s.restaurant_id AND status IN ('scheduled', 'counting')) THEN
      INSERT INTO public.stock_counts (restaurant_id, status, kind, due_date, blind_count)
      VALUES (s.restaurant_id, 'scheduled', 'scheduled', s.next_due_date, s.blind_count);
      INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
      VALUES (s.restaurant_id, 'Balanço de estoque de hoje',
              format('O balanço de estoque de %s está agendado para hoje. Abra Estoque → Balanço para começar.', s.name),
              'stock_count', ARRAY['admin', 'finance']);
      n := n + 1;
    END IF;
    UPDATE public.stock_count_settings SET next_due_date = public.next_stock_count_date(frequency, weekday, month_day, v_today)
     WHERE restaurant_id = s.restaurant_id;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.stock_count_scheduler() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('stock-count-scheduler') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-count-scheduler');
  -- 6h de Brasília (9h UTC)
  PERFORM cron.schedule('stock-count-scheduler', '0 9 * * *', 'SELECT public.stock_count_scheduler()');
END $$;
