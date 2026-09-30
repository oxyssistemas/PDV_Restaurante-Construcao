
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;

-- Tokens: apenas service role
CREATE TABLE public.marketing_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','google')),
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, provider)
);
GRANT ALL ON public.marketing_credentials TO service_role;
ALTER TABLE public.marketing_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('facebook_page','instagram','whatsapp','google_location','meta_ads','google_ads')),
  external_id text NOT NULL,
  name text,
  parent_id text,
  selected boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, kind, external_id)
);

CREATE TABLE public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channels text[] NOT NULL DEFAULT '{}',
  caption text NOT NULL DEFAULT '',
  image_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','publishing','published','error')),
  scheduled_for timestamptz,
  published_at timestamptz,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketing_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  metric_date date NOT NULL,
  followers integer,
  reach integer,
  views integer,
  calls integer,
  directions integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, channel, metric_date)
);

CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_name text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  last_message text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text,
  message_type text NOT NULL DEFAULT 'text',
  external_id text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX whatsapp_messages_external_idx ON public.whatsapp_messages(restaurant_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text NOT NULL DEFAULT 'MARKETING',
  body text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  variables integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name, language)
);

CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','google')),
  name text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'paused',
  daily_budget numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ad_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, metric_date)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_accounts','marketing_posts','marketing_metrics_daily','whatsapp_conversations','whatsapp_messages','whatsapp_templates','ad_campaigns','ad_metrics_daily'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "mkt view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.module_guard(restaurant_id, ''marketing'', false))', t);
    EXECUTE format('CREATE POLICY "mkt edit %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.module_guard(restaurant_id, ''marketing'', true)) WITH CHECK (public.module_guard(restaurant_id, ''marketing'', true))', t);
    EXECUTE format('CREATE INDEX ON public.%I(restaurant_id)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['marketing_credentials','marketing_accounts','marketing_posts','marketing_metrics_daily','whatsapp_conversations','whatsapp_templates','ad_campaigns'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

CREATE INDEX ON public.whatsapp_messages(conversation_id, created_at);
CREATE INDEX ON public.marketing_posts(status, scheduled_for);

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
