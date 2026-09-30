-- Central de publicação: Facebook, Instagram e TikTok com foto ou vídeo, agora ou agendado.

-- 1) TikTok como provedor e tipo de conta
ALTER TABLE public.marketing_credentials DROP CONSTRAINT marketing_credentials_provider_check;
ALTER TABLE public.marketing_credentials ADD CONSTRAINT marketing_credentials_provider_check
  CHECK (provider IN ('meta', 'google', 'tiktok'));

ALTER TABLE public.marketing_accounts DROP CONSTRAINT marketing_accounts_kind_check;
ALTER TABLE public.marketing_accounts ADD CONSTRAINT marketing_accounts_kind_check
  CHECK (kind IN ('facebook_page', 'instagram', 'whatsapp', 'google_location', 'meta_ads', 'google_ads', 'tiktok'));

-- Tokens das páginas ficam em metadata: o front não precisa (nem deve) lê-los.
REVOKE SELECT ON public.marketing_accounts FROM authenticated;
GRANT SELECT (id, restaurant_id, provider, kind, external_id, name, parent_id, selected, created_at, updated_at)
  ON public.marketing_accounts TO authenticated;

-- 2) Publicações: tipo de mídia, resultado por rede, opções e trava contra publicação dupla
ALTER TABLE public.marketing_posts
  ADD COLUMN media_type text NOT NULL DEFAULT 'none' CHECK (media_type IN ('none', 'image', 'video')),
  ADD COLUMN results jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN options jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN locked_until timestamptz;
COMMENT ON COLUMN public.marketing_posts.image_path IS 'Caminho da mídia (foto ou vídeo) no bucket marketing-media';
COMMENT ON COLUMN public.marketing_posts.results IS 'Resultado por rede: {rede: {status, id, url, error, ref, started_at}}';

ALTER TABLE public.marketing_posts DROP CONSTRAINT marketing_posts_status_check;
ALTER TABLE public.marketing_posts ADD CONSTRAINT marketing_posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'error'));

-- 3) Bucket das mídias de marketing (privado; pasta = id do restaurante)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketing-media', 'marketing-media', false, 52428800,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Marketing vê mídias do restaurante" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-media'
         AND public.module_guard(((storage.foldername(name))[1])::uuid, 'marketing', false));
CREATE POLICY "Marketing envia mídias do restaurante" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-media'
              AND public.module_guard(((storage.foldername(name))[1])::uuid, 'marketing', true));
CREATE POLICY "Marketing remove mídias do restaurante" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-media'
         AND public.module_guard(((storage.foldername(name))[1])::uuid, 'marketing', true));

-- 4) Agendador: chama a função marketing-scheduler a cada minuto com um segredo guardado no Vault
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'marketing_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'marketing_cron_secret');
  END IF;
END $$;

-- A função do agendador confere o segredo recebido com este valor (só o service_role pode ler).
CREATE OR REPLACE FUNCTION public.marketing_cron_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_cron_secret'
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_cron_secret() TO service_role;

SELECT cron.unschedule('marketing-scheduler') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-scheduler');
SELECT cron.schedule('marketing-scheduler', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/marketing-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_cron_secret')
    ),
    body := '{}'::jsonb
  )
$cron$);
