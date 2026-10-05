-- Taxa de serviço (ex.: 10%) e couvert por pessoa, cobrados no fechamento da conta.
-- A taxa é opcional para o cliente (o caixa pode tirar na hora); o valor aplicado fica gravado no pedido.

CREATE TABLE IF NOT EXISTS public.service_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_enabled boolean NOT NULL DEFAULT false,
  service_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (service_percent >= 0 AND service_percent <= 30),
  service_on_delivery boolean NOT NULL DEFAULT false,
  couvert_enabled boolean NOT NULL DEFAULT false,
  couvert_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (couvert_amount >= 0),
  couvert_label text NOT NULL DEFAULT 'Couvert artístico',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_settings_read ON public.service_settings;
CREATE POLICY service_settings_read ON public.service_settings FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
DROP POLICY IF EXISTS service_settings_manage ON public.service_settings;
CREATE POLICY service_settings_manage ON public.service_settings FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id));

DROP TRIGGER IF EXISTS update_service_settings_updated_at ON public.service_settings;
CREATE TRIGGER update_service_settings_updated_at BEFORE UPDATE ON public.service_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Valores aplicados na conta (NULL = ainda não fechada; o caixa calcula na hora).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee numeric(10,2) CHECK (service_fee IS NULL OR service_fee >= 0),
  ADD COLUMN IF NOT EXISTS couvert_total numeric(10,2) CHECK (couvert_total IS NULL OR couvert_total >= 0),
  ADD COLUMN IF NOT EXISTS people_count integer CHECK (people_count IS NULL OR people_count >= 0);

-- Central offline: as configurações vão junto na cópia da loja (o caixa funciona igual sem internet).
DO $$
DECLARE d text; a text; b text; c text; e text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  IF position('service_settings' in d) > 0 THEN RETURN; END IF;
  a := $x$'ifood_orders', 'print_jobs', 'audit_logs'];$x$;
  b := $x$'ifood_orders', 'print_jobs', 'audit_logs', 'service_settings'];$x$;
  c := $x$      'print_jobs', '[]'::jsonb,$x$;
  e := $x$      'service_settings', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') FROM public.service_settings t WHERE t.restaurant_id = _restaurant_id),
      'print_jobs', '[]'::jsonb,$x$;
  IF position(a in d) = 0 OR position(c in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a, b), c, e);
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_replica(uuid) TO service_role;

-- Aviso em tempo real para a central offline quando a configuração mudar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_offline_hub_change') THEN
    DROP TRIGGER IF EXISTS offline_hub_notify ON public.service_settings;
    CREATE TRIGGER offline_hub_notify AFTER INSERT OR UPDATE OR DELETE ON public.service_settings
      FOR EACH ROW EXECUTE FUNCTION public.notify_offline_hub_change();
  END IF;
END $$;
