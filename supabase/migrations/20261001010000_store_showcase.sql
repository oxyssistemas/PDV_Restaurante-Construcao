-- Vitrine da loja online: banner principal, destaques escolhidos e promoções.
-- Imagens no bucket público "store-media":
--   <restaurant_id>/...  fotos enviadas pela loja
--   sugestoes/...        galeria de sugestões (enviadas pela Oxys pelo painel do Supabase)

ALTER TABLE public.delivery_stores
  ADD COLUMN IF NOT EXISTS hero_title text,
  ADD COLUMN IF NOT EXISTS hero_highlight text,
  ADD COLUMN IF NOT EXISTS hero_subtitle text,
  ADD COLUMN IF NOT EXISTS hero_image text,
  ADD COLUMN IF NOT EXISTS featured_item_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.delivery_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 80),
  subtitle text CHECK (subtitle IS NULL OR length(subtitle) <= 200),
  image text,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL, -- preço e "adicionar" vêm do prato
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_promotions_restaurant_idx ON public.delivery_promotions (restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS delivery_promotions_menu_item_idx ON public.delivery_promotions (menu_item_id);
ALTER TABLE public.delivery_promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery staff manage promotions" ON public.delivery_promotions;
CREATE POLICY "delivery staff manage promotions" ON public.delivery_promotions FOR ALL TO authenticated
  USING (public.is_delivery_staff(restaurant_id)) WITH CHECK (public.is_delivery_staff(restaurant_id));
DROP TRIGGER IF EXISTS delivery_promotions_updated_at ON public.delivery_promotions;
CREATE TRIGGER delivery_promotions_updated_at BEFORE UPDATE ON public.delivery_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- imagens ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-media', 'store-media', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Pasta do restaurante: só a equipe do delivery dele envia/troca/apaga.
CREATE OR REPLACE FUNCTION public.store_media_folder_ok(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN v_id := (storage.foldername(_name))[1]::uuid; EXCEPTION WHEN OTHERS THEN RETURN false; END;
  RETURN public.is_delivery_staff(v_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.store_media_folder_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_media_folder_ok(text) TO authenticated;

DROP POLICY IF EXISTS "store-media list" ON storage.objects;
CREATE POLICY "store-media list" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'store-media' AND ((storage.foldername(name))[1] = 'sugestoes' OR public.store_media_folder_ok(name)));
DROP POLICY IF EXISTS "store-media upload" ON storage.objects;
CREATE POLICY "store-media upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-media' AND public.store_media_folder_ok(name));
DROP POLICY IF EXISTS "store-media update" ON storage.objects;
CREATE POLICY "store-media update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'store-media' AND public.store_media_folder_ok(name));
DROP POLICY IF EXISTS "store-media delete" ON storage.objects;
CREATE POLICY "store-media delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'store-media' AND public.store_media_folder_ok(name));
