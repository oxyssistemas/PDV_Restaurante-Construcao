-- Impressão: cadastro de impressoras, fila de trabalhos e gatilhos automáticos.
-- Os documentos ficam na fila em formato estruturado; quem imprime (estação no navegador,
-- agente local, impressora nuvem) renderiza no formato que precisa.

CREATE TABLE public.printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- browser: estação de impressão aberta no navegador de um PC
  -- agent: agente local (impressora de rede/USB)
  -- cloudprnt / epson_sdp: impressora que busca os trabalhos sozinha
  connection text NOT NULL DEFAULT 'browser' CHECK (connection IN ('browser', 'agent', 'cloudprnt', 'epson_sdp')),
  purposes text[] NOT NULL DEFAULT ARRAY['kitchen'],
  auto_print boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  model text NOT NULL DEFAULT 'generic',
  width text NOT NULL DEFAULT '80mm' CHECK (width IN ('58mm', '80mm')),
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 5),
  address text,
  header_note text,
  footer_note text,
  device_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex') UNIQUE,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT printers_purposes_check CHECK (purposes <@ ARRAY['kitchen', 'order', 'receipt', 'nfce']::text[])
);
CREATE INDEX ON public.printers (restaurant_id);
CREATE TRIGGER trg_printers_updated BEFORE UPDATE ON public.printers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- O token do dispositivo só é usado pelo servidor (agente/impressora nuvem).
GRANT SELECT (id, restaurant_id, name, connection, purposes, auto_print, enabled, model, width, copies, address,
              header_note, footer_note, last_seen_at, created_at, updated_at) ON public.printers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.printers TO authenticated;
GRANT ALL ON public.printers TO service_role;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe vê as impressoras do restaurante" ON public.printers FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
CREATE POLICY "Admin gerencia as impressoras" ON public.printers FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin') AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid())))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin') AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid())));

-- Configurações antigas (uma por finalidade) viram impressoras de navegador.
INSERT INTO public.printers (restaurant_id, name, purposes, auto_print, enabled, model, width, copies, header_note, footer_note)
SELECT restaurant_id,
       CASE purpose WHEN 'kitchen' THEN 'Cozinha' WHEN 'receipt' THEN 'Caixa' ELSE 'Comanda' END,
       ARRAY[purpose], purpose = 'kitchen', enabled, model, width, copies, header_note, footer_note
FROM public.printer_settings;

CREATE TABLE public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  printer_id uuid NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('kitchen', 'order', 'receipt', 'nfce', 'test')),
  document jsonb NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'printing', 'done', 'error', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_by text,
  claimed_at timestamptz,
  printed_at timestamptz,
  error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.print_jobs (printer_id, status, created_at);
CREATE INDEX ON public.print_jobs (restaurant_id, created_at DESC);
CREATE INDEX ON public.print_jobs (order_id);
GRANT SELECT, INSERT, UPDATE ON public.print_jobs TO authenticated;
GRANT ALL ON public.print_jobs TO service_role;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe vê a fila de impressão" ON public.print_jobs FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
CREATE POLICY "Equipe envia para impressão" ON public.print_jobs FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id)
              AND EXISTS (SELECT 1 FROM public.printers p WHERE p.id = printer_id AND p.restaurant_id = print_jobs.restaurant_id));
CREATE POLICY "Equipe atualiza a fila de impressão" ON public.print_jobs FOR UPDATE TO authenticated
  USING (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;

-- Reserva um trabalho para uma estação (evita duas estações imprimirem o mesmo cupom).
-- Um trabalho "imprimindo" há mais de 2 minutos é considerado travado e pode ser retomado.
CREATE OR REPLACE FUNCTION public.claim_print_job(_job_id uuid, _station text)
RETURNS SETOF public.print_jobs LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.print_jobs
     SET status = 'printing', claimed_by = _station, claimed_at = now(), attempts = attempts + 1
   WHERE id = _job_id
     AND (status = 'queued' OR (status = 'printing' AND claimed_at < now() - interval '2 minutes'))
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION public.claim_print_job(uuid, text) TO authenticated;

-- Nome que sai no topo do cupom: o da identidade visual, senão o cadastro do restaurante.
CREATE OR REPLACE FUNCTION public.print_restaurant_name(_restaurant_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(b.brand_name), ''), r.name)
  FROM public.restaurants r LEFT JOIN public.branding_settings b ON b.restaurant_id = r.id
  WHERE r.id = _restaurant_id
$$;

CREATE OR REPLACE FUNCTION public.print_order_header(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', o.id, 'created_at', o.created_at, 'order_type', o.order_type, 'table_number', t.number,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone, 'customer_address', o.customer_address,
    'notes', o.notes, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'created_by_name', o.created_by_name, 'created_by_role', o.created_by_role, 'source', o.source)
  FROM public.orders o LEFT JOIN public.restaurant_tables t ON t.id = o.table_id
  WHERE o.id = _order_id
$$;

-- Pedido novo → via da cozinha em cada impressora automática de cozinha.
-- Itens inseridos na mesma transação (um envio) entram no mesmo cupom.
CREATE OR REPLACE FUNCTION public.enqueue_kitchen_print()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_printer record;
  v_job uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_item := jsonb_build_object(
    'name', COALESCE((SELECT m.name FROM public.menu_items m WHERE m.id = NEW.menu_item_id), 'Item'),
    'quantity', NEW.quantity, 'notes', NEW.notes);

  FOR v_printer IN
    SELECT id FROM public.printers
    WHERE restaurant_id = v_order.restaurant_id AND enabled AND auto_print AND 'kitchen' = ANY(purposes)
  LOOP
    SELECT id INTO v_job FROM public.print_jobs
     WHERE printer_id = v_printer.id AND order_id = NEW.order_id AND purpose = 'kitchen'
       AND status = 'queued' AND document->>'txid' = txid_current()::text
     LIMIT 1;
    IF v_job IS NULL THEN
      INSERT INTO public.print_jobs (restaurant_id, printer_id, purpose, order_id, created_by, document)
      VALUES (v_order.restaurant_id, v_printer.id, 'kitchen', NEW.order_id, auth.uid(), jsonb_build_object(
        'kind', 'kitchen', 'txid', txid_current()::text,
        'restaurant_name', public.print_restaurant_name(v_order.restaurant_id),
        'order', public.print_order_header(NEW.order_id),
        'items', jsonb_build_array(v_item)));
    ELSE
      UPDATE public.print_jobs SET document = jsonb_set(document, '{items}', (document->'items') || v_item) WHERE id = v_job;
    END IF;
    v_job := NULL;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enqueue_kitchen_print AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_kitchen_print();

-- Conta quitada → recibo nas impressoras automáticas de recibo (uma vez por comanda).
-- É também o ponto onde a emissão automática de NFC-e vai se ligar.
CREATE OR REPLACE FUNCTION public.on_payment_recorded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items_total numeric;
  v_paid numeric;
  v_printer record;
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
  RETURN NEW;
END $$;

CREATE TRIGGER trg_on_payment_recorded AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_recorded();

