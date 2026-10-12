-- Balança: prato vendido por quilo (preço do kg); o item lançado guarda o peso e sai na NFC-e em KG
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sold_by_weight boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS weight_kg numeric(8,3) CHECK (weight_kg IS NULL OR weight_kg > 0);

-- prato por quilo precisa ser pesado: não entra nos pedidos do QR, totem e loja online
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['create_qr_order', 'create_kiosk_order', 'create_online_order'] LOOP
    d := pg_get_functiondef(('public.' || f)::regproc);
    CONTINUE WHEN position('sold_by_weight' in d) > 0;
    d := replace(d, 'AND public.menu_item_on_now(mi.available_days, mi.available_from, mi.available_to);',
                    'AND public.menu_item_on_now(mi.available_days, mi.available_from, mi.available_to) AND NOT mi.sold_by_weight;');
    EXECUTE d;
  END LOOP;
END $$;
