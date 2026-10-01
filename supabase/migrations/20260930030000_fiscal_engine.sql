-- Motor de emissão de NFC-e: fila no servidor, emissor plugável (simulado / Focus NFe).

-- Tokens e identificação do restaurante no emissor fiscal: só o servidor lê.
CREATE TABLE public.fiscal_provider_accounts (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  company_ref text,
  token_homologation text,
  token_production text,
  synced_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_provider_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_provider_accounts FROM anon, authenticated;
GRANT ALL ON public.fiscal_provider_accounts TO service_role;

-- Controle da fila e dados de retorno da SEFAZ.
ALTER TABLE public.fiscal_invoices
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN consult_url text,
  ADD COLUMN provider_response jsonb,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancel_reason text;
CREATE INDEX ON public.fiscal_invoices (status, next_attempt_at);
-- No máximo uma nota válida por pedido.
CREATE UNIQUE INDEX fiscal_invoices_one_per_order ON public.fiscal_invoices (order_id)
  WHERE order_id IS NOT NULL AND status <> 'cancelled';

-- Segredo que autoriza o banco (gatilho e cron) a chamar a função fiscal.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'fiscal_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fiscal_cron_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_cron_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'fiscal_cron_secret'
$$;
REVOKE EXECUTE ON FUNCTION public.fiscal_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_cron_secret() TO service_role;

-- Acorda a função fiscal (sai depois do commit; não segura o caixa).
CREATE OR REPLACE FUNCTION public.fiscal_kick(_invoice_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url := 'https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/fiscal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.fiscal_cron_secret()),
    body := jsonb_build_object('invoice_id', _invoice_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fiscal_kick(uuid) FROM PUBLIC, anon, authenticated;

-- Conta quitada → recibo (já existia) + NFC-e na fila quando o restaurante liga a emissão automática.
CREATE OR REPLACE FUNCTION public.on_payment_recorded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items_total numeric;
  v_paid numeric;
  v_printer record;
  v_profile public.fiscal_profiles%ROWTYPE;
  v_invoice uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(sum(quantity * unit_price), 0) INTO v_items_total
    FROM public.order_items WHERE order_id = NEW.order_id AND status <> 'cancelled';
  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.payments WHERE order_id = NEW.order_id;
  IF v_paid + 0.009 < GREATEST(v_items_total + COALESCE(v_order.delivery_fee, 0), COALESCE(v_order.total, 0)) THEN
    RETURN NEW; -- ainda há saldo em aberto
  END IF;

  FOR v_printer IN
    SELECT id FROM public.printers
    WHERE restaurant_id = v_order.restaurant_id AND enabled AND auto_print AND 'receipt' = ANY(purposes)
      AND NOT EXISTS (SELECT 1 FROM public.print_jobs j WHERE j.printer_id = printers.id
                      AND j.order_id = NEW.order_id AND j.purpose = 'receipt')
  LOOP
    INSERT INTO public.print_jobs (restaurant_id, printer_id, purpose, order_id, created_by, document)
    SELECT v_order.restaurant_id, v_printer.id, 'receipt', NEW.order_id, auth.uid(), jsonb_build_object(
      'kind', 'receipt',
      'restaurant_name', public.print_restaurant_name(v_order.restaurant_id),
      'order', public.print_order_header(NEW.order_id),
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', COALESCE(m.name, 'Item'), 'quantity', oi.quantity,
                       'unit_price', oi.unit_price, 'notes', oi.notes) ORDER BY oi.created_at), '[]'::jsonb)
                FROM public.order_items oi LEFT JOIN public.menu_items m ON m.id = oi.menu_item_id
                WHERE oi.order_id = NEW.order_id AND oi.status <> 'cancelled'),
      'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount) ORDER BY p.created_at), '[]'::jsonb)
                   FROM public.payments p WHERE p.order_id = NEW.order_id),
      'change', (SELECT COALESCE(sum(change_amount), 0) FROM public.payments p WHERE p.order_id = NEW.order_id));
  END LOOP;

  SELECT * INTO v_profile FROM public.fiscal_profiles WHERE restaurant_id = v_order.restaurant_id;
  IF FOUND AND v_profile.active AND v_profile.auto_emit_on_payment
     AND NOT EXISTS (SELECT 1 FROM public.fiscal_invoices WHERE order_id = NEW.order_id AND status <> 'cancelled') THEN
    INSERT INTO public.fiscal_invoices (restaurant_id, order_id, status, customer_name, subtotal, discount, total,
                                        environment, provider, next_attempt_at, created_by)
    VALUES (v_order.restaurant_id, NEW.order_id, 'pending', COALESCE(v_order.customer_name, 'Consumidor'),
            v_items_total + COALESCE(v_order.delivery_fee, 0), 0, v_items_total + COALESCE(v_order.delivery_fee, 0),
            v_profile.environment, v_profile.provider, now(), auth.uid())
    RETURNING id INTO v_invoice;
    PERFORM public.fiscal_kick(v_invoice);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_payment_recorded() FROM PUBLIC, anon, authenticated;

-- Rede de segurança: retentativas e notas que ficaram para trás.
SELECT cron.unschedule('fiscal-worker') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiscal-worker');
SELECT cron.schedule('fiscal-worker', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/fiscal',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'fiscal_cron_secret')),
    body := '{}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM public.fiscal_invoices
                WHERE status = 'pending' AND COALESCE(next_attempt_at, now()) <= now())
$cron$);
