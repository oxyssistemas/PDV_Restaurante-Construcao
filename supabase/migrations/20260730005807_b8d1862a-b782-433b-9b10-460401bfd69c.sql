
-- ============ FICHA TÉCNICA ============
CREATE TABLE public.menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, inventory_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_ingredients TO authenticated;
GRANT ALL ON public.menu_item_ingredients TO service_role;
ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view ingredients" ON public.menu_item_ingredients
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id) AND public.is_restaurant_active(restaurant_id));
CREATE POLICY "Admins and finance manage ingredients" ON public.menu_item_ingredients
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')) AND restaurant_id = public.get_user_restaurant_id(auth.uid()));
CREATE TRIGGER update_menu_item_ingredients_updated_at BEFORE UPDATE ON public.menu_item_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NOTIFICAÇÕES ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  target_roles text[] NOT NULL DEFAULT ARRAY['admin','finance'],
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "Restaurant users can update notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_restaurant(auth.uid(), restaurant_id))
  WITH CHECK (public.user_belongs_to_restaurant(auth.uid(), restaurant_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============ ALERTA DE ESTOQUE BAIXO ============
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quantity <= NEW.minimum_stock AND (TG_OP = 'INSERT' OR OLD.quantity > OLD.minimum_stock OR OLD.quantity <> NEW.quantity) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.restaurant_id = NEW.restaurant_id
        AND n.type = 'low_stock'
        AND n.message LIKE '%' || NEW.name || '%'
        AND n.created_at > now() - interval '6 hours'
    ) THEN
      INSERT INTO public.notifications (restaurant_id, title, message, type, target_roles)
      VALUES (NEW.restaurant_id, 'Estoque baixo',
        NEW.name || ' está com ' || trim(to_char(NEW.quantity,'FM999999990.999')) || ' ' || NEW.unit ||
        ' (mínimo: ' || trim(to_char(NEW.minimum_stock,'FM999999990.999')) || ' ' || NEW.unit || ')',
        'low_stock', ARRAY['admin','finance']);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_low_stock AFTER INSERT OR UPDATE OF quantity, minimum_stock ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- ============ BAIXA AUTOMÁTICA DE ESTOQUE ============
CREATE OR REPLACE FUNCTION public.consume_inventory_for_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ing RECORD;
  v_restaurant uuid;
  v_user uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_sign int := CASE WHEN TG_OP = 'DELETE' THEN 1 ELSE -1 END;
  v_item order_items;
BEGIN
  v_item := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT o.restaurant_id INTO v_restaurant FROM public.orders o WHERE o.id = v_item.order_id;
  IF v_restaurant IS NULL THEN RETURN v_item; END IF;

  FOR ing IN
    SELECT mi.inventory_id, mi.quantity FROM public.menu_item_ingredients mi
    WHERE mi.menu_item_id = v_item.menu_item_id
  LOOP
    UPDATE public.inventory
      SET quantity = GREATEST(quantity + (v_sign * ing.quantity * v_item.quantity), 0)
      WHERE id = ing.inventory_id;

    INSERT INTO public.inventory_movements (inventory_id, restaurant_id, type, quantity, reason, user_id)
    VALUES (ing.inventory_id, v_restaurant,
      CASE WHEN v_sign = -1 THEN 'exit'::inventory_movement_type ELSE 'entry'::inventory_movement_type END,
      ing.quantity * v_item.quantity,
      CASE WHEN v_sign = -1 THEN 'Baixa automática por pedido' ELSE 'Estorno de item de pedido' END,
      v_user);
  END LOOP;

  RETURN v_item;
END; $$;

CREATE TRIGGER trg_consume_inventory AFTER INSERT OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.consume_inventory_for_order_item();

-- ============ PEDIDOS: AUTORIA, DELIVERY ============
ALTER TABLE public.orders
  ADD COLUMN created_by uuid,
  ADD COLUMN created_by_name text,
  ADD COLUMN created_by_role text,
  ADD COLUMN order_type text NOT NULL DEFAULT 'dine_in',
  ADD COLUMN customer_phone text,
  ADD COLUMN customer_address text,
  ADD COLUMN delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending',
  ALTER COLUMN table_id DROP NOT NULL,
  ALTER COLUMN waiter_id DROP NOT NULL;

-- ============ RLS: CAIXA E DELIVERY PODEM LANÇAR PEDIDOS ============
DROP POLICY IF EXISTS "Waiters can create orders" ON public.orders;
CREATE POLICY "Staff can create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'cashier')
      OR public.has_role(auth.uid(),'delivery') OR public.has_role(auth.uid(),'admin'))
    AND restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(restaurant_id)
  );

DROP POLICY IF EXISTS "Waiters and kitchen can update orders" ON public.orders;
CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'kitchen')
      OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery'))
    AND restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(restaurant_id)
  )
  WITH CHECK (
    (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'kitchen')
      OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery'))
    AND restaurant_id = public.get_user_restaurant_id(auth.uid())
    AND public.is_restaurant_active(restaurant_id)
  );

DROP POLICY IF EXISTS "Waiters can create order items" ON public.order_items;
CREATE POLICY "Staff can create order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'cashier')
        OR public.has_role(auth.uid(),'delivery') OR public.has_role(auth.uid(),'admin'))
      AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Waiters and kitchen can update order items" ON public.order_items;
CREATE POLICY "Staff can update order items" ON public.order_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'kitchen')
        OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'delivery'))
      AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
  ));

CREATE POLICY "Staff can delete order items" ON public.order_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (public.has_role(auth.uid(),'waiter') OR public.has_role(auth.uid(),'cashier')
        OR public.has_role(auth.uid(),'admin'))
      AND o.restaurant_id = public.get_user_restaurant_id(auth.uid())
  ));

-- pagamentos de delivery: caixa já gerencia; garante leitura por delivery via user_belongs_to_restaurant existente
