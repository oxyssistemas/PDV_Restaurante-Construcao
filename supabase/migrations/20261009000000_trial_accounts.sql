-- Teste grátis de 14 dias: a pessoa cria a conta sozinha (www.oxysrestaurante.app/cadastro),
-- usa tudo da plataforma e, quando o prazo acaba, a loja fica bloqueada até a Oxys liberar um plano.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
COMMENT ON COLUMN public.restaurants.trial_ends_at IS 'Fim do teste grátis. Vazio = cliente com plano (sem prazo).';

-- loja em teste vencido conta como inativa em todas as regras de acesso
CREATE OR REPLACE FUNCTION public.is_restaurant_active(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = _restaurant_id AND r.status = 'active'
      AND (r.trial_ends_at IS NULL OR r.trial_ends_at > now())
      -- filial de loja em teste vencido também para
      AND NOT EXISTS (SELECT 1 FROM public.restaurants p WHERE p.id = r.parent_id AND p.trial_ends_at <= now())
  )
$$;

-- prazo do teste também só muda pela Oxys
CREATE OR REPLACE FUNCTION public.guard_restaurant_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF; -- sistema / super admin
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.branch_limit IS DISTINCT FROM OLD.branch_limit
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'Plano, situação, teste, matriz e limite de filiais só podem ser alterados pela Oxys.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- situação do teste das lojas da pessoa (funciona mesmo com a loja bloqueada, para mostrar o aviso)
CREATE OR REPLACE FUNCTION public.my_trial_status()
RETURNS TABLE (restaurant_id uuid, name text, trial_ends_at timestamptz, expired boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT r.id, r.name, COALESCE(r.trial_ends_at, p.trial_ends_at),
         COALESCE(r.trial_ends_at, p.trial_ends_at) <= now()
  FROM public.user_roles ur
  JOIN public.restaurants r ON r.id = ur.restaurant_id
  LEFT JOIN public.restaurants p ON p.id = r.parent_id
  WHERE ur.user_id = auth.uid() AND COALESCE(r.trial_ends_at, p.trial_ends_at) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_trial_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trial_status() TO authenticated;

-- cadastros de teste (para limitar abuso por endereço)
CREATE TABLE IF NOT EXISTS public.trial_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id uuid,
  email text NOT NULL,
  phone text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_signups_super_admin ON public.trial_signups FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'));
CREATE INDEX IF NOT EXISTS trial_signups_ip_idx ON public.trial_signups (ip, created_at);
