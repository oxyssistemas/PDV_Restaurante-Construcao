-- Financeiro: contas a receber, taxas/prazos de cartão (recebíveis previstos), extrato bancário (OFX) com
-- conciliação e boletos (Asaas). A chave do Asaas fica numa tabela que só o servidor lê.

CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_name text,
  customer_document text,
  customer_email text,
  customer_phone text,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 200),
  category text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'received', 'cancelled')),
  received_at timestamptz,
  payment_method text,
  notes text,
  boleto_provider text,
  boleto_id text,
  boleto_url text,
  boleto_barcode text,
  pix_code text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_receivable_restaurant_idx ON public.accounts_receivable (restaurant_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_receivable_boleto_uniq ON public.accounts_receivable (boleto_provider, boleto_id) WHERE boleto_id IS NOT NULL;

-- taxas e prazos da maquininha (para prever quando e quanto cai na conta)
CREATE TABLE IF NOT EXISTS public.card_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  debit_fee numeric(5,2) NOT NULL DEFAULT 1.5 CHECK (debit_fee BETWEEN 0 AND 30),
  debit_days integer NOT NULL DEFAULT 1 CHECK (debit_days BETWEEN 0 AND 60),
  credit_fee numeric(5,2) NOT NULL DEFAULT 3.5 CHECK (credit_fee BETWEEN 0 AND 30),
  credit_days integer NOT NULL DEFAULT 30 CHECK (credit_days BETWEEN 0 AND 60),
  pix_fee numeric(5,2) NOT NULL DEFAULT 0 CHECK (pix_fee BETWEEN 0 AND 30),
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  opening_balance_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- extrato do banco (OFX) e conciliação
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  account text,
  fitid text NOT NULL,
  posted_on date NOT NULL,
  amount numeric(12,2) NOT NULL,
  memo text,
  matched_type text CHECK (matched_type IS NULL OR matched_type IN ('payable', 'receivable', 'card', 'ignored')),
  matched_id uuid,
  matched_note text,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, account, fitid)
);
CREATE INDEX IF NOT EXISTS bank_transactions_restaurant_idx ON public.bank_transactions (restaurant_id, posted_on DESC);

CREATE TABLE IF NOT EXISTS public.finance_integrations (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  asaas_api_key text,
  asaas_sandbox boolean NOT NULL DEFAULT false,
  asaas_webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_integrations ENABLE ROW LEVEL SECURITY; -- sem políticas: só o servidor (chave secreta)

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts_receivable', 'card_settings', 'bank_transactions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Finance can view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (has_module_access((SELECT auth.uid()), restaurant_id, 'crm', false) AND is_restaurant_active(restaurant_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Finance can manage %1$s" ON public.%1$I FOR ALL TO authenticated
      USING (has_module_access((SELECT auth.uid()), restaurant_id, 'crm', true) AND is_restaurant_active(restaurant_id))
      WITH CHECK (has_module_access((SELECT auth.uid()), restaurant_id, 'crm', true) AND is_restaurant_active(restaurant_id))$p$, t);
  END LOOP;
END $$;
CREATE TRIGGER update_accounts_receivable_updated_at BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_card_settings_updated_at BEFORE UPDATE ON public.card_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- o crm por padrão é do financeiro também
DO $$
DECLARE d text := pg_get_functiondef('public.has_module_access(uuid,uuid,text,boolean)'::regprocedure);
BEGIN
  IF position('''crm''' in d) = 0 THEN
    d := replace(d, 'WHEN _module IN (''hr'',''dre'',''loyalty'') AND public.has_role(_user_id, ''finance'') THEN true',
                    'WHEN _module IN (''hr'',''dre'',''loyalty'',''crm'') AND public.has_role(_user_id, ''finance'') THEN true');
    EXECUTE d;
  END IF;
END $$;

-- se a loja tem a chave do Asaas (sem mostrar a chave)
CREATE OR REPLACE FUNCTION public.finance_integration_status(_restaurant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_module_access(auth.uid(), _restaurant_id, 'crm', false)
    THEN jsonb_build_object('asaas', (SELECT asaas_api_key IS NOT NULL FROM public.finance_integrations WHERE restaurant_id = _restaurant_id),
                            'sandbox', (SELECT asaas_sandbox FROM public.finance_integrations WHERE restaurant_id = _restaurant_id))
    ELSE NULL END
$$;
