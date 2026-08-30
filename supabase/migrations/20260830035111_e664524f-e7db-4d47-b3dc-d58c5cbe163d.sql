-- 1. Tabela de permissões por módulo
CREATE TABLE public.module_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id, module)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_permissions TO authenticated;
GRANT ALL ON public.module_permissions TO service_role;

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_permissions_read" ON public.module_permissions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.has_role(auth.uid(), 'admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "module_permissions_manage" ON public.module_permissions
FOR ALL TO authenticated
USING (
  (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.has_role(auth.uid(), 'admin'))
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.has_role(auth.uid(), 'admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE TRIGGER update_module_permissions_updated_at
BEFORE UPDATE ON public.module_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_module_permissions_user ON public.module_permissions (user_id, restaurant_id);

-- 2. Plano do restaurante libera a funcionalidade?
CREATE OR REPLACE FUNCTION public.restaurant_has_feature(_restaurant_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (p.features ->> _feature)::boolean
       FROM public.restaurants r
       JOIN public.plans p ON p.code = r.plan_code
      WHERE r.id = _restaurant_id),
    true)
$$;

-- 3. Acesso do usuário ao módulo (permissão explícita ou padrão do cargo)
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _restaurant_id uuid, _module text, _edit boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perm RECORD;
  v_default boolean := false;
BEGIN
  IF _user_id IS NULL OR _restaurant_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'super_admin') THEN RETURN true; END IF;
  IF NOT public.user_belongs_to_restaurant(_user_id, _restaurant_id) THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'admin') THEN RETURN true; END IF;

  SELECT can_view, can_edit INTO v_perm
  FROM public.module_permissions
  WHERE user_id = _user_id AND restaurant_id = _restaurant_id AND module = _module;

  IF FOUND THEN
    RETURN CASE WHEN _edit THEN v_perm.can_edit ELSE (v_perm.can_view OR v_perm.can_edit) END;
  END IF;

  -- padrões por cargo
  v_default := CASE
    WHEN _module IN ('hr','dre','loyalty') AND public.has_role(_user_id, 'finance') THEN true
    WHEN _module = 'hr' AND public.has_role(_user_id, 'hr') THEN true
    WHEN _module = 'marketing' AND public.has_role(_user_id, 'marketing') THEN true
    ELSE false
  END;

  RETURN v_default;
END;
$$;

-- 4. Guarda combinada: plano + permissão de módulo
CREATE OR REPLACE FUNCTION public.module_guard(_restaurant_id uuid, _module text, _edit boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
     OR (public.restaurant_has_feature(_restaurant_id, _module)
         AND public.has_module_access(auth.uid(), _restaurant_id, _module, _edit))
$$;

REVOKE EXECUTE ON FUNCTION public.restaurant_has_feature(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.module_guard(uuid, text, boolean) FROM anon;

-- 5. RH
DROP POLICY IF EXISTS employees_read ON public.employees;
DROP POLICY IF EXISTS employees_manage ON public.employees;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', false));
CREATE POLICY employees_manage ON public.employees FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', true))
  WITH CHECK (public.module_guard(restaurant_id, 'hr', true));

DROP POLICY IF EXISTS employee_shifts_read ON public.employee_shifts;
DROP POLICY IF EXISTS employee_shifts_manage ON public.employee_shifts;
CREATE POLICY employee_shifts_read ON public.employee_shifts FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', false));
CREATE POLICY employee_shifts_manage ON public.employee_shifts FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', true))
  WITH CHECK (public.module_guard(restaurant_id, 'hr', true));

DROP POLICY IF EXISTS payroll_entries_read ON public.payroll_entries;
DROP POLICY IF EXISTS payroll_entries_manage ON public.payroll_entries;
DROP POLICY IF EXISTS payroll_entries_all ON public.payroll_entries;
CREATE POLICY payroll_entries_read ON public.payroll_entries FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', false));
CREATE POLICY payroll_entries_manage ON public.payroll_entries FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'hr', true))
  WITH CHECK (public.module_guard(restaurant_id, 'hr', true));

-- 6. DRE
DROP POLICY IF EXISTS dre_categories_read ON public.dre_categories;
DROP POLICY IF EXISTS dre_categories_manage ON public.dre_categories;
CREATE POLICY dre_categories_read ON public.dre_categories FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'dre', false));
CREATE POLICY dre_categories_manage ON public.dre_categories FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'dre', true))
  WITH CHECK (public.module_guard(restaurant_id, 'dre', true));

-- 7. Fidelidade
DROP POLICY IF EXISTS loyalty_programs_read ON public.loyalty_programs;
DROP POLICY IF EXISTS loyalty_programs_manage ON public.loyalty_programs;
CREATE POLICY loyalty_programs_read ON public.loyalty_programs FOR SELECT TO authenticated
  USING (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY loyalty_programs_manage ON public.loyalty_programs FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'loyalty', true))
  WITH CHECK (public.module_guard(restaurant_id, 'loyalty', true));

DROP POLICY IF EXISTS loyalty_rewards_read ON public.loyalty_rewards;
DROP POLICY IF EXISTS loyalty_rewards_manage ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_read ON public.loyalty_rewards FOR SELECT TO authenticated
  USING (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY loyalty_rewards_manage ON public.loyalty_rewards FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'loyalty', true))
  WITH CHECK (public.module_guard(restaurant_id, 'loyalty', true));

DROP POLICY IF EXISTS loyalty_accounts_read ON public.loyalty_accounts;
DROP POLICY IF EXISTS loyalty_accounts_write ON public.loyalty_accounts;
CREATE POLICY loyalty_accounts_read ON public.loyalty_accounts FOR SELECT TO authenticated
  USING (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY loyalty_accounts_write ON public.loyalty_accounts FOR ALL TO authenticated
  USING (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
         AND public.is_restaurant_active(restaurant_id))
  WITH CHECK (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
         AND public.is_restaurant_active(restaurant_id));

DROP POLICY IF EXISTS loyalty_transactions_read ON public.loyalty_transactions;
DROP POLICY IF EXISTS loyalty_transactions_insert ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_read ON public.loyalty_transactions FOR SELECT TO authenticated
  USING (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY loyalty_transactions_insert ON public.loyalty_transactions FOR INSERT TO authenticated
  WITH CHECK (public.restaurant_has_feature(restaurant_id, 'loyalty')
         AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id)
         AND public.is_restaurant_active(restaurant_id));

-- 8. Marketing
DROP POLICY IF EXISTS marketing_connections_read ON public.marketing_connections;
DROP POLICY IF EXISTS marketing_connections_manage ON public.marketing_connections;
DROP POLICY IF EXISTS marketing_connections_all ON public.marketing_connections;
CREATE POLICY marketing_connections_read ON public.marketing_connections FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'marketing', false));
CREATE POLICY marketing_connections_manage ON public.marketing_connections FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'marketing', true))
  WITH CHECK (public.module_guard(restaurant_id, 'marketing', true));

DROP POLICY IF EXISTS marketing_campaigns_read ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_manage ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_all ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_read ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (public.module_guard(restaurant_id, 'marketing', false));
CREATE POLICY marketing_campaigns_manage ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'marketing', true))
  WITH CHECK (public.module_guard(restaurant_id, 'marketing', true));

-- 9. Identidade visual (white label)
DROP POLICY IF EXISTS branding_read ON public.branding_settings;
DROP POLICY IF EXISTS branding_manage ON public.branding_settings;
CREATE POLICY branding_read ON public.branding_settings FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY branding_manage ON public.branding_settings FOR ALL TO authenticated
  USING (public.module_guard(restaurant_id, 'branding', true))
  WITH CHECK (public.module_guard(restaurant_id, 'branding', true));

-- 10. Assistente de IA
DROP POLICY IF EXISTS ai_conversations_own ON public.ai_conversations;
CREATE POLICY ai_conversations_own ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.module_guard(restaurant_id, 'ai', false))
  WITH CHECK (user_id = auth.uid() AND public.module_guard(restaurant_id, 'ai', false));

DROP POLICY IF EXISTS ai_messages_own ON public.ai_messages;
CREATE POLICY ai_messages_own ON public.ai_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.module_guard(restaurant_id, 'ai', false))
  WITH CHECK (user_id = auth.uid() AND public.module_guard(restaurant_id, 'ai', false));