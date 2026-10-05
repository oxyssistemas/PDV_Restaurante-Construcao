-- Pacote para o contador: XMLs das NFC-e + planilhas do mês num ZIP, com link para enviar.

-- XML de cada nota autorizada guardado no nosso armazenamento (obrigação de guardar por 5 anos).
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS xml_path text;

-- Contato do contador (para enviar o link por WhatsApp ou email).
ALTER TABLE public.fiscal_profiles
  ADD COLUMN IF NOT EXISTS accountant_name text,
  ADD COLUMN IF NOT EXISTS accountant_email text,
  ADD COLUMN IF NOT EXISTS accountant_phone text;

INSERT INTO storage.buckets (id, name, public) VALUES ('fiscal-xml', 'fiscal-xml', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('accountant-packages', 'accountant-packages', false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.accountant_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  period date NOT NULL,                -- primeiro dia do mês
  file_path text NOT NULL,
  file_size integer,
  invoices_count integer NOT NULL DEFAULT 0,
  xml_count integer NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  invoiced numeric(12,2) NOT NULL DEFAULT 0,
  warnings text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accountant_exports_restaurant ON public.accountant_exports (restaurant_id, created_at DESC);
ALTER TABLE public.accountant_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accountant_exports_read ON public.accountant_exports;
CREATE POLICY accountant_exports_read ON public.accountant_exports FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.restaurant_id = accountant_exports.restaurant_id
                    AND ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'supervisor'::app_role, 'finance'::app_role])));
-- gravação só pela função fiscal (service role)
