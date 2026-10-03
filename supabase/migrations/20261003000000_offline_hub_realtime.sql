-- Central offline sempre em dia: cada mudança na nuvem (pedido, item, pagamento, mesa, cardápio) avisa a
-- central na hora, por um canal de broadcast com nome secreto. O aviso não leva dados, só "mudou";
-- a central então baixa o retrato atualizado. A cópia a cada 20 s continua como reserva.

ALTER TABLE public.offline_hubs
  ADD COLUMN IF NOT EXISTS channel_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex');

CREATE OR REPLACE FUNCTION public.notify_offline_hub_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rid uuid;
  v_token text;
BEGIN
  -- o envio da própria central não precisa voltar para ela
  IF public.is_offline_sync() THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'order_items' THEN
    SELECT o.restaurant_id INTO v_rid FROM public.orders o
     WHERE o.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  ELSE
    v_rid := CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END;
  END IF;
  IF v_rid IS NULL THEN RETURN NULL; END IF;

  SELECT h.channel_token INTO v_token FROM public.offline_hubs h WHERE h.restaurant_id = v_rid;
  IF v_token IS NULL THEN RETURN NULL; END IF; -- loja sem central: nada a fazer

  PERFORM realtime.send(jsonb_build_object('t', TG_TABLE_NAME), 'changed', 'oxys-hub-' || v_token, false);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- aviso nunca pode atrapalhar o pedido
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_offline_hub_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'order_items', 'payments', 'restaurant_tables', 'menu_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS offline_hub_notify ON public.%I', t);
    EXECUTE format('CREATE TRIGGER offline_hub_notify AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.notify_offline_hub_change()', t);
  END LOOP;
END $$;
