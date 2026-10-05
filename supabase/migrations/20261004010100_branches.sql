-- Filiais (plano Enterprise).
-- Cada filial é um restaurante próprio (dados, cardápio, equipe e caixa separados) ligado à matriz (parent_id).
-- O dono (admin da matriz) cria as filiais até o limite definido pelo super admin e administra todas;
-- o gerente administra uma filial; o supervisor, as filiais que forem dele.
-- Quem trabalha em mais de uma loja escolhe em qual está agora (user_active_restaurant); todas as regras de
-- acesso olham essa loja, e o cargo que vale é o cargo naquela loja.

-- ---------- filiais ----------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS branch_limit integer NOT NULL DEFAULT 0 CHECK (branch_limit >= 0);
CREATE INDEX IF NOT EXISTS restaurants_parent_id_idx ON public.restaurants (parent_id);

-- filial não tem filial (um nível só)
CREATE OR REPLACE FUNCTION public.check_branch_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'A loja não pode ser filial dela mesma.'; END IF;
    IF EXISTS (SELECT 1 FROM public.restaurants p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Uma filial não pode ter filiais.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.restaurants c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Uma matriz com filiais não pode virar filial.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurants_check_branch_parent ON public.restaurants;
CREATE TRIGGER restaurants_check_branch_parent BEFORE INSERT OR UPDATE OF parent_id ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.check_branch_parent();

-- recurso do plano
UPDATE public.plans SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('branches', code = 'enterprise');

-- ---------- loja em que a pessoa está trabalhando agora ----------
CREATE TABLE IF NOT EXISTS public.user_active_restaurant (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_active_restaurant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_active_restaurant_own ON public.user_active_restaurant;
CREATE POLICY user_active_restaurant_own ON public.user_active_restaurant FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Loja ativa: a escolhida (se a pessoa ainda pertence a ela) ou a primeira, como antes.
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT COALESCE(
    (SELECT a.restaurant_id FROM public.user_active_restaurant a
      WHERE a.user_id = _user_id
        AND EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = _user_id AND r.restaurant_id = a.restaurant_id AND r.role <> 'super_admin')),
    (SELECT restaurant_id FROM public.user_roles
      WHERE user_id = _user_id AND role <> 'super_admin' AND restaurant_id IS NOT NULL
      ORDER BY created_at ASC, id ASC LIMIT 1)
  )
$function$;

-- Cargo na loja ativa. Gerente e supervisor valem como admin dentro das lojas deles.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = _user_id
       AND (r.role = _role OR (_role = 'admin' AND r.role IN ('manager', 'supervisor')))
       AND (r.role = 'super_admin' OR r.restaurant_id = public.get_user_restaurant_id(_user_id))
  )
$function$;

-- Trocar de loja (dono e supervisor): só para uma loja em que a pessoa tem cargo.
CREATE OR REPLACE FUNCTION public.set_active_restaurant(_restaurant_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND restaurant_id = _restaurant_id) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta loja.';
  END IF;
  INSERT INTO public.user_active_restaurant (user_id, restaurant_id) VALUES (auth.uid(), _restaurant_id)
  ON CONFLICT (user_id) DO UPDATE SET restaurant_id = excluded.restaurant_id, updated_at = now();
  RETURN _restaurant_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_active_restaurant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_restaurant(uuid) TO authenticated;

-- ---------- equipe: gerente/supervisor não criam nem mexem em outros gerentes, supervisores ou admins ----------
DROP POLICY IF EXISTS "Admins can add staff roles in their restaurant" ON public.user_roles;
CREATE POLICY "Admins can add staff roles in their restaurant" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
              AND is_restaurant_active(restaurant_id) AND role <> ALL (ARRAY['admin', 'super_admin', 'manager', 'supervisor']::app_role[]));
DROP POLICY IF EXISTS "Admins can remove staff roles in their restaurant" ON public.user_roles;
CREATE POLICY "Admins can remove staff roles in their restaurant" ON public.user_roles FOR DELETE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
         AND is_restaurant_active(restaurant_id) AND role <> ALL (ARRAY['admin', 'super_admin', 'manager', 'supervisor']::app_role[]));
DROP POLICY IF EXISTS "Admins can update staff roles in their restaurant" ON public.user_roles;
CREATE POLICY "Admins can update staff roles in their restaurant" ON public.user_roles FOR UPDATE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
         AND is_restaurant_active(restaurant_id) AND role <> ALL (ARRAY['admin', 'super_admin', 'manager', 'supervisor']::app_role[]))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND restaurant_id = get_user_restaurant_id((SELECT auth.uid()))
              AND is_restaurant_active(restaurant_id) AND role <> ALL (ARRAY['admin', 'super_admin', 'manager', 'supervisor']::app_role[]));

-- ---------- busca de usuário por email (só para as funções do sistema) ----------
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;

-- ---------- só o super admin (ou o próprio sistema) muda plano, situação, matriz e limite de filiais ----------
-- (antes, o admin da loja conseguia trocar o próprio plano direto pela API)
CREATE OR REPLACE FUNCTION public.guard_restaurant_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF; -- sistema / super admin
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.branch_limit IS DISTINCT FROM OLD.branch_limit THEN
    RAISE EXCEPTION 'Plano, situação, matriz e limite de filiais só podem ser alterados pela Oxys.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurants_guard_admin_fields ON public.restaurants;
CREATE TRIGGER restaurants_guard_admin_fields BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_admin_fields();
