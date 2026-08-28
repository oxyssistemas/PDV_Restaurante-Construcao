
-- ========== ENUM: novos papéis ==========
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';

-- ========== PLANOS ==========
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_month numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read_authenticated" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_manage_super_admin" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'enterprise';

INSERT INTO public.plans (code, name, description, price_month, sort_order, features) VALUES
 ('essencial','Essencial','Operação básica do restaurante', 0, 1, '{"orders":true,"tables":true,"menu":true,"kitchen":true,"cashier":true,"inventory":true,"reports":false,"hr":false,"dre":false,"loyalty":false,"marketing":false,"branding":false,"ai":false,"delivery":false,"fiscal":false,"crm":false}'::jsonb),
 ('profissional','Profissional','Gestão completa com financeiro e delivery', 0, 2, '{"orders":true,"tables":true,"menu":true,"kitchen":true,"cashier":true,"inventory":true,"reports":true,"hr":true,"dre":true,"loyalty":true,"marketing":false,"branding":false,"ai":false,"delivery":true,"fiscal":true,"crm":true}'::jsonb),
 ('enterprise','Enterprise','Todos os recursos, marca própria e IA', 0, 3, '{"orders":true,"tables":true,"menu":true,"kitchen":true,"cashier":true,"inventory":true,"reports":true,"hr":true,"dre":true,"loyalty":true,"marketing":true,"branding":true,"ai":true,"delivery":true,"fiscal":true,"crm":true}'::jsonb);

-- ========== RH ==========
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  document text,
  role_title text,
  sector text NOT NULL DEFAULT 'salao',
  contract_type text NOT NULL DEFAULT 'clt',
  base_salary numeric NOT NULL DEFAULT 0,
  pix_key text,
  phone text,
  email text,
  birthdate date,
  hired_at date,
  terminated_at date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_read" ON public.employees FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "employees_manage" ON public.employees FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_shifts TO authenticated;
GRANT ALL ON public.employee_shifts TO service_role;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_shifts_read" ON public.employee_shifts FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "employee_shifts_manage" ON public.employee_shifts FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_employee_shifts_updated_at BEFORE UPDATE ON public.employee_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'salary',
  reference_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_entries TO authenticated;
GRANT ALL ON public.payroll_entries TO service_role;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_manage" ON public.payroll_entries FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_payroll_entries_updated_at BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== DRE ==========
CREATE TABLE public.dre_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_key text NOT NULL DEFAULT 'operational',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_categories TO authenticated;
GRANT ALL ON public.dre_categories TO service_role;
ALTER TABLE public.dre_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dre_categories_read" ON public.dre_categories FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "dre_categories_manage" ON public.dre_categories FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_dre_categories_updated_at BEFORE UPDATE ON public.dre_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== FIDELIDADE ==========
CREATE TABLE public.loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT 'Programa de Fidelidade',
  mode text NOT NULL DEFAULT 'points',
  points_per_currency numeric NOT NULL DEFAULT 1,
  cashback_percent numeric NOT NULL DEFAULT 0,
  stamps_required integer NOT NULL DEFAULT 10,
  min_order_value numeric NOT NULL DEFAULT 0,
  points_expire_days integer NOT NULL DEFAULT 365,
  channels text[] NOT NULL DEFAULT ARRAY['dine_in','delivery','counter'],
  weekday_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_programs TO authenticated;
GRANT ALL ON public.loyalty_programs TO service_role;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_programs_read" ON public.loyalty_programs FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "loyalty_programs_manage" ON public.loyalty_programs FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_loyalty_programs_updated_at BEFORE UPDATE ON public.loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  reward_type text NOT NULL DEFAULT 'discount_value',
  cost_points integer NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_rewards TO authenticated;
GRANT ALL ON public.loyalty_rewards TO service_role;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_rewards_read" ON public.loyalty_rewards FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "loyalty_rewards_manage" ON public.loyalty_rewards FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_loyalty_rewards_updated_at BEFORE UPDATE ON public.loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  customer_document text,
  points_balance numeric NOT NULL DEFAULT 0,
  cashback_balance numeric NOT NULL DEFAULT 0,
  stamps integer NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  total_redeemed numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_accounts TO authenticated;
GRANT ALL ON public.loyalty_accounts TO service_role;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_accounts_read" ON public.loyalty_accounts FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "loyalty_accounts_write" ON public.loyalty_accounts FOR ALL TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));
CREATE TRIGGER update_loyalty_accounts_updated_at BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reward_id uuid REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'earn',
  points numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.loyalty_transactions TO authenticated;
GRANT ALL ON public.loyalty_transactions TO service_role;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_transactions_read" ON public.loyalty_transactions FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "loyalty_transactions_insert" ON public.loyalty_transactions FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));

-- ========== MARKETING ==========
CREATE TABLE public.marketing_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  account_name text,
  account_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_connections TO authenticated;
GRANT ALL ON public.marketing_connections TO service_role;
ALTER TABLE public.marketing_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_connections_manage" ON public.marketing_connections FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_marketing_connections_updated_at BEFORE UPDATE ON public.marketing_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_campaigns_manage" ON public.marketing_campaigns FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_marketing_campaigns_updated_at BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== WHITE LABEL ==========
CREATE TABLE public.branding_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  brand_name text,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  login_background_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  background_color text,
  foreground_color text,
  sidebar_color text,
  font_heading text NOT NULL DEFAULT 'Space Grotesk',
  font_body text NOT NULL DEFAULT 'Inter',
  radius text NOT NULL DEFAULT '0.75rem',
  density text NOT NULL DEFAULT 'comfortable',
  theme_mode text NOT NULL DEFAULT 'dark',
  login_message text,
  footer_text text,
  receipt_header text,
  receipt_footer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branding_settings TO authenticated;
GRANT ALL ON public.branding_settings TO service_role;
ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branding_read" ON public.branding_settings FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "branding_manage" ON public.branding_settings FOR ALL TO authenticated
  USING ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.has_role(auth.uid(),'admin')) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK ((public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.has_role(auth.uid(),'admin')) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_branding_settings_updated_at BEFORE UPDATE ON public.branding_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== IA ==========
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversations_own" ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id))
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_messages_own" ON public.ai_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id))
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id));

CREATE INDEX idx_employees_restaurant ON public.employees(restaurant_id);
CREATE INDEX idx_payroll_restaurant_month ON public.payroll_entries(restaurant_id, reference_month);
CREATE INDEX idx_loyalty_accounts_phone ON public.loyalty_accounts(restaurant_id, customer_phone);
CREATE INDEX idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);
