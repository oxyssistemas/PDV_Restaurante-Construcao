-- 1. Reservas: vínculo com pedidos + validação de titular
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_reservation_id ON public.orders(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservations_table_date ON public.reservations(table_id, reservation_date);

CREATE OR REPLACE FUNCTION public.enforce_table_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_local timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  r RECORD;
BEGIN
  IF NEW.table_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO r
  FROM public.reservations res
  WHERE res.table_id = NEW.table_id
    AND res.status = 'confirmed'
    AND res.reservation_date = v_local::date
    AND (res.reservation_date + res.start_time - interval '30 minutes') <= v_local
    AND (res.reservation_date + res.end_time) >= v_local
  ORDER BY res.start_time
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.reservation_id IS NOT NULL AND NEW.reservation_id = r.id THEN RETURN NEW; END IF;

  IF NEW.customer_name IS NOT NULL
     AND lower(btrim(NEW.customer_name)) = lower(btrim(r.customer_name)) THEN
    NEW.reservation_id := r.id;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mesa reservada para % das % as %. Apenas o titular da reserva pode ocupar esta mesa.',
    r.customer_name, to_char(r.start_time, 'HH24:MI'), to_char(r.end_time, 'HH24:MI');
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_table_reservation ON public.orders;
CREATE TRIGGER trg_enforce_table_reservation
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_table_reservation();

-- 2. Configuração de impressoras térmicas por restaurante
CREATE TABLE IF NOT EXISTS public.printer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('order', 'kitchen', 'receipt')),
  enabled boolean NOT NULL DEFAULT true,
  model text NOT NULL DEFAULT 'generic',
  device_name text,
  width text NOT NULL DEFAULT '80mm' CHECK (width IN ('58mm', '80mm')),
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 5),
  header_note text,
  footer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, purpose)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.printer_settings TO authenticated;
GRANT ALL ON public.printer_settings TO service_role;

ALTER TABLE public.printer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant users can view printer settings"
ON public.printer_settings FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));

CREATE POLICY "Admins can manage printer settings"
ON public.printer_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id));

DROP TRIGGER IF EXISTS update_printer_settings_updated_at ON public.printer_settings;
CREATE TRIGGER update_printer_settings_updated_at
BEFORE UPDATE ON public.printer_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();