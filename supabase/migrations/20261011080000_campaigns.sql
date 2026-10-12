-- Marketing: campanhas de WhatsApp por segmento (só clientes que aceitaram receber ofertas — LGPD) e
-- convite para avaliar no Google depois de uma nota alta no NPS.

ALTER TABLE public.feedback_settings
  ADD COLUMN IF NOT EXISTS google_review_url text CHECK (google_review_url IS NULL OR google_review_url ~ '^https://'),
  ADD COLUMN IF NOT EXISTS google_min_score integer NOT NULL DEFAULT 9 CHECK (google_min_score BETWEEN 0 AND 10);

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  mode text NOT NULL DEFAULT 'assisted' CHECK (mode IN ('assisted', 'template')),
  message text,                 -- texto (envio assistido) — {nome} vira o primeiro nome
  template_name text,           -- modelo aprovado na Meta (envio automático)
  template_lang text NOT NULL DEFAULT 'pt_BR',
  segment jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'done')),
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  UNIQUE (campaign_id, phone)
);
CREATE INDEX IF NOT EXISTS whatsapp_campaign_recipients_idx ON public.whatsapp_campaign_recipients (campaign_id, status);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_campaigns', 'whatsapp_campaign_recipients'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Marketing can view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (has_module_access((SELECT auth.uid()), restaurant_id, 'marketing', false) AND is_restaurant_active(restaurant_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Marketing can manage %1$s" ON public.%1$I FOR ALL TO authenticated
      USING (has_module_access((SELECT auth.uid()), restaurant_id, 'marketing', true) AND is_restaurant_active(restaurant_id))
      WITH CHECK (has_module_access((SELECT auth.uid()), restaurant_id, 'marketing', true) AND is_restaurant_active(restaurant_id))$p$, t);
  END LOOP;
END $$;
CREATE TRIGGER update_whatsapp_campaigns_updated_at BEFORE UPDATE ON public.whatsapp_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

/*
  Público da campanha. Só clientes do CRM com "aceita receber ofertas" e telefone.
  _seg = { inactive_days?, active_days?, min_orders?, min_spent?, birthday_month?: bool, channel?: 'all'|'delivery'|'salon' }
*/
CREATE OR REPLACE FUNCTION public.campaign_audience(_restaurant_id uuid, _seg jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_module_access(auth.uid(), _restaurant_id, 'marketing', false) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  WITH c AS (
    SELECT DISTINCT ON (right(regexp_replace(phone, '\D', '', 'g'), 11))
           right(regexp_replace(phone, '\D', '', 'g'), 11) AS p11, name, birthdate
      FROM public.customers
     WHERE restaurant_id = _restaurant_id AND marketing_opt_in AND length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 10
     ORDER BY right(regexp_replace(phone, '\D', '', 'g'), 11), updated_at DESC
  ), o AS (
    SELECT right(regexp_replace(customer_phone, '\D', '', 'g'), 11) AS p11, count(*) AS orders,
           sum(total + COALESCE(delivery_fee, 0) - COALESCE(discount, 0)) AS spent, max(created_at) AS last_order
      FROM public.orders
     WHERE restaurant_id = _restaurant_id AND status <> 'cancelled' AND customer_phone IS NOT NULL
       AND (COALESCE(_seg->>'channel', 'all') = 'all'
            OR (_seg->>'channel' = 'delivery' AND order_type IN ('delivery', 'takeaway'))
            OR (_seg->>'channel' = 'salon' AND order_type = 'dine_in'))
     GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('phone', '55' || c.p11, 'name', c.name, 'orders', COALESCE(o.orders, 0),
           'spent', round(COALESCE(o.spent, 0), 2), 'last_order', o.last_order) ORDER BY o.spent DESC NULLS LAST), '[]')
    INTO r
    FROM c LEFT JOIN o ON o.p11 = c.p11
   WHERE (NULLIF(_seg->>'inactive_days', '') IS NULL OR (o.last_order IS NOT NULL AND o.last_order < now() - make_interval(days => (_seg->>'inactive_days')::int)))
     AND (NULLIF(_seg->>'active_days', '') IS NULL OR o.last_order >= now() - make_interval(days => (_seg->>'active_days')::int))
     AND (NULLIF(_seg->>'min_orders', '') IS NULL OR COALESCE(o.orders, 0) >= (_seg->>'min_orders')::int)
     AND (NULLIF(_seg->>'min_spent', '') IS NULL OR COALESCE(o.spent, 0) >= (_seg->>'min_spent')::numeric)
     AND (COALESCE((_seg->>'birthday_month')::boolean, false) = false
          OR extract(month FROM c.birthdate) = extract(month FROM now() AT TIME ZONE 'America/Sao_Paulo'))
     AND (COALESCE(_seg->>'channel', 'all') = 'all' OR o.p11 IS NOT NULL);
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.campaign_audience(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_audience(uuid, jsonb) TO authenticated, service_role;

-- avaliação pública devolve o link do Google (convite depois de nota alta)
DO $$
DECLARE d text := pg_get_functiondef('public.review_info(uuid)'::regprocedure);
BEGIN
  IF position('google_review_url' in d) = 0 THEN
    d := replace(d, '''thank_you'', f.thank_you,', '''thank_you'', f.thank_you, ''google_review_url'', f.google_review_url, ''google_min_score'', COALESCE(f.google_min_score, 9),');
    EXECUTE d;
  END IF;
END $$;
