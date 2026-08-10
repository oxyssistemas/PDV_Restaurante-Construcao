
-- ============ CUSTOMERS (CRM) ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  document text,
  address text,
  birthdate date,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "customers_write" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'cashier'))))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'cashier'))));
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_customers_restaurant ON public.customers(restaurant_id);

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text,
  contact_name text,
  phone text,
  email text,
  address text,
  category text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))));
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_suppliers_restaurant ON public.suppliers(restaurant_id);

-- ============ ACCOUNTS PAYABLE ============
CREATE TYPE public.payable_status AS ENUM ('open','paid','cancelled');
CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  description text NOT NULL,
  category text,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status public.payable_status NOT NULL DEFAULT 'open',
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payable_select" ON public.accounts_payable FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "payable_write" ON public.accounts_payable FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))));
CREATE TRIGGER update_accounts_payable_updated_at BEFORE UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payable_restaurant ON public.accounts_payable(restaurant_id, due_date);

-- ============ FISCAL INVOICES ============
CREATE TYPE public.fiscal_invoice_status AS ENUM ('draft','pending','issued','cancelled','error');
CREATE TABLE public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  number text,
  series text,
  status public.fiscal_invoice_status NOT NULL DEFAULT 'draft',
  customer_name text,
  customer_document text,
  customer_email text,
  customer_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  notes text,
  provider text,
  provider_ref text,
  xml_url text,
  pdf_url text,
  issued_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoices TO service_role;
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "invoices_write" ON public.fiscal_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))));
CREATE TRIGGER update_fiscal_invoices_updated_at BEFORE UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_invoices_restaurant ON public.fiscal_invoices(restaurant_id, created_at DESC);

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  user_role text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND user_id = auth.uid());
CREATE INDEX idx_audit_restaurant ON public.audit_logs(restaurant_id, created_at DESC);
