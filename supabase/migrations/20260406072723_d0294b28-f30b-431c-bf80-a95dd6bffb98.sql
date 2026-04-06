
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'waiter', 'kitchen', 'cashier', 'finance');

-- Create enum for table status
CREATE TYPE public.table_status AS ENUM ('free', 'occupied', 'reserved');

-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- Create enum for order item status
CREATE TYPE public.order_item_status AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- Create enum for payment method
CREATE TYPE public.payment_method AS ENUM ('cash', 'credit_card', 'debit_card', 'pix');

-- Create enum for cash movement type
CREATE TYPE public.cash_movement_type AS ENUM ('sangria', 'suprimento');

-- Create enum for inventory movement type
CREATE TYPE public.inventory_movement_type AS ENUM ('entry', 'exit');

-- Create enum for reservation status
CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');

-- Create enum for restaurant status
CREATE TYPE public.restaurant_status AS ENUM ('active', 'blocked');

-- ============================================
-- TABLES
-- ============================================

-- Restaurants
CREATE TABLE public.restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  status public.restaurant_status NOT NULL DEFAULT 'active',
  subscription_plan TEXT DEFAULT 'basic',
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (links users to restaurants with roles)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, restaurant_id)
);

-- Restaurant tables
CREATE TABLE public.restaurant_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  status public.table_status NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, number)
);

-- Reservations
CREATE TABLE public.reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu categories
CREATE TABLE public.menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu items
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.restaurant_tables(id),
  waiter_id UUID NOT NULL REFERENCES auth.users(id),
  status public.order_status NOT NULL DEFAULT 'pending',
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order items
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  minimum_stock DECIMAL(10,3) NOT NULL DEFAULT 0,
  cost_per_unit DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory movements
CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type public.inventory_movement_type NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  reason TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cash registers
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  opening_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_amount DECIMAL(10,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes_opening TEXT,
  notes_closing TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cash movements (sangria/suprimento)
CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  cash_register_id UUID REFERENCES public.cash_registers(id),
  method public.payment_method NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  change_amount DECIMAL(10,2) DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's restaurant_id
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.user_roles
  WHERE user_id = _user_id AND role != 'super_admin'
  LIMIT 1
$$;

-- Function to check if user belongs to a restaurant
CREATE OR REPLACE FUNCTION public.user_belongs_to_restaurant(_user_id UUID, _restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND restaurant_id = _restaurant_id
  )
$$;

-- Function to check if restaurant is active
CREATE OR REPLACE FUNCTION public.is_restaurant_active(_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = _restaurant_id AND status = 'active'
  )
$$;

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_restaurant_tables_updated_at BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- RESTAURANTS
CREATE POLICY "Super admins can do everything with restaurants" ON public.restaurants FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own active restaurant" ON public.restaurants FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), id) AND status = 'active'
);

-- USER_ROLES
CREATE POLICY "Super admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can manage roles in their restaurant" ON public.user_roles FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RESTAURANT_TABLES
CREATE POLICY "Super admins can manage all tables" ON public.restaurant_tables FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Restaurant users can view their tables" ON public.restaurant_tables FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins can manage their tables" ON public.restaurant_tables FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Waiters can update table status" ON public.restaurant_tables FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'waiter') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'waiter') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- RESERVATIONS
CREATE POLICY "Restaurant users can view reservations" ON public.reservations FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins and waiters can manage reservations" ON public.reservations FOR ALL TO authenticated USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'waiter')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'waiter')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- MENU_CATEGORIES
CREATE POLICY "Restaurant users can view categories" ON public.menu_categories FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins can manage categories" ON public.menu_categories FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- MENU_ITEMS
CREATE POLICY "Restaurant users can view menu items" ON public.menu_items FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins can manage menu items" ON public.menu_items FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- ORDERS
CREATE POLICY "Restaurant users can view orders" ON public.orders FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Waiters can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'waiter') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id) AND waiter_id = auth.uid()
);

CREATE POLICY "Waiters and kitchen can update orders" ON public.orders FOR UPDATE TO authenticated USING (
  (public.has_role(auth.uid(), 'waiter') OR public.has_role(auth.uid(), 'kitchen')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'waiter') OR public.has_role(auth.uid(), 'kitchen')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- ORDER_ITEMS
CREATE POLICY "Restaurant users can view order items" ON public.order_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND public.user_belongs_to_restaurant(auth.uid(), o.restaurant_id) AND public.is_restaurant_active(o.restaurant_id)
  )
);

CREATE POLICY "Waiters can create order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND public.has_role(auth.uid(), 'waiter') AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
  )
);

CREATE POLICY "Waiters and kitchen can update order items" ON public.order_items FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND (public.has_role(auth.uid(), 'waiter') OR public.has_role(auth.uid(), 'kitchen')) AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
  )
);

-- INVENTORY
CREATE POLICY "Restaurant users can view inventory" ON public.inventory FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins and finance can manage inventory" ON public.inventory FOR ALL TO authenticated USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- INVENTORY_MOVEMENTS
CREATE POLICY "Restaurant users can view movements" ON public.inventory_movements FOR SELECT TO authenticated USING (
  public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Admins and finance can create movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- CASH_REGISTERS
CREATE POLICY "Cashiers and admins can manage registers" ON public.cash_registers FOR ALL TO authenticated USING (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Finance can view registers" ON public.cash_registers FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'finance') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- CASH_MOVEMENTS
CREATE POLICY "Cashiers and admins can manage cash movements" ON public.cash_movements FOR ALL TO authenticated USING (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Finance can view cash movements" ON public.cash_movements FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'finance') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- PAYMENTS
CREATE POLICY "Cashiers and admins can manage payments" ON public.payments FOR ALL TO authenticated USING (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
) WITH CHECK (
  (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

CREATE POLICY "Finance can view payments" ON public.payments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'finance') AND restaurant_id = public.get_user_restaurant_id(auth.uid()) AND public.is_restaurant_active(restaurant_id)
);

-- Enable realtime for orders and order_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
