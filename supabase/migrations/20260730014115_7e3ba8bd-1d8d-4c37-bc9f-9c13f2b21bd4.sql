ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.menu_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  parent_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_components_unique UNIQUE (parent_item_id, component_item_id),
  CONSTRAINT menu_item_components_no_self CHECK (parent_item_id <> component_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_components TO authenticated;
GRANT ALL ON public.menu_item_components TO service_role;

ALTER TABLE public.menu_item_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant users can view combo components"
ON public.menu_item_components FOR SELECT TO authenticated
USING (user_belongs_to_restaurant(auth.uid(), restaurant_id) AND is_restaurant_active(restaurant_id));

CREATE POLICY "Admins and finance manage combo components"
ON public.menu_item_components FOR ALL TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) AND restaurant_id = get_user_restaurant_id(auth.uid()))
WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) AND restaurant_id = get_user_restaurant_id(auth.uid()));

CREATE TRIGGER update_menu_item_components_updated_at
BEFORE UPDATE ON public.menu_item_components
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.consume_inventory_for_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- ingredientes diretos do item
    SELECT mi.inventory_id, mi.quantity::numeric AS quantity
    FROM public.menu_item_ingredients mi
    WHERE mi.menu_item_id = v_item.menu_item_id
    UNION ALL
    -- ingredientes dos itens que compõem um combo
    SELECT mi.inventory_id, (mi.quantity * c.quantity)::numeric AS quantity
    FROM public.menu_item_components c
    JOIN public.menu_item_ingredients mi ON mi.menu_item_id = c.component_item_id
    WHERE c.parent_item_id = v_item.menu_item_id
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
END; $function$;