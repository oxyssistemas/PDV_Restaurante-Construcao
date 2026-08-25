-- ============ FASE 1: BASE FISCAL NFC-e ============

CREATE TYPE public.fiscal_environment AS ENUM ('homologation', 'production');
CREATE TYPE public.tax_regime AS ENUM ('simples_nacional', 'simples_excesso', 'regime_normal');

CREATE TABLE public.fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- Identificação do emitente
  cnpj text,
  legal_name text,
  trade_name text,
  state_registration text,
  municipal_registration text,
  tax_regime public.tax_regime NOT NULL DEFAULT 'simples_nacional',
  -- Endereço fiscal
  street text,
  number text,
  complement text,
  district text,
  city text,
  city_code text,
  state text,
  zip_code text,
  phone text,
  -- Configuração de emissão
  environment public.fiscal_environment NOT NULL DEFAULT 'homologation',
  provider text NOT NULL DEFAULT 'focus_nfe',
  nfce_series text NOT NULL DEFAULT '1',
  nfce_next_number integer NOT NULL DEFAULT 1,
  csc_id text,
  csc_token text,
  certificate_path text,
  certificate_expires_at date,
  certificate_uploaded_at timestamptz,
  auto_emit_on_payment boolean NOT NULL DEFAULT false,
  -- Padrões fiscais dos itens
  default_ncm text,
  default_cfop text DEFAULT '5102',
  default_csosn text,
  default_origin text NOT NULL DEFAULT '0',
  default_unit text NOT NULL DEFAULT 'UN',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_profiles TO authenticated;
GRANT ALL ON public.fiscal_profiles TO service_role;

ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e financeiro veem o perfil fiscal do seu restaurante"
ON public.fiscal_profiles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
    AND public.is_restaurant_active(restaurant_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  )
);

CREATE POLICY "Admin cria o perfil fiscal do seu restaurante"
ON public.fiscal_profiles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
    AND public.is_restaurant_active(restaurant_id)
    AND public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admin edita o perfil fiscal do seu restaurante"
ON public.fiscal_profiles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
    AND public.is_restaurant_active(restaurant_id)
    AND public.has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
    AND public.is_restaurant_active(restaurant_id)
    AND public.has_role(auth.uid(), 'admin')
  )
);

CREATE TRIGGER update_fiscal_profiles_updated_at
BEFORE UPDATE ON public.fiscal_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Campos fiscais nos itens do cardápio ============
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS csosn text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS commercial_unit text;

-- ============ Campos de retorno da SEFAZ nas notas ============
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS access_key text,
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS environment public.fiscal_environment,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qrcode_url text;

CREATE INDEX IF NOT EXISTS idx_fiscal_invoices_order ON public.fiscal_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_invoices_status ON public.fiscal_invoices(restaurant_id, status);