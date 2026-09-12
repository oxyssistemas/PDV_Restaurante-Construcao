ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS qr_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_tables_qr_token
  ON public.restaurant_tables(qr_token);

COMMENT ON COLUMN public.restaurant_tables.qr_token IS 'Token não sequencial usado no link público do cardápio da mesa.';
COMMENT ON COLUMN public.restaurant_tables.qr_enabled IS 'Controla se a mesa aceita pedidos pelo QR Code.';