ALTER TABLE public.inventory_movements ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.consume_inventory_for_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ing RECORD;
  v_restaurant uuid;
  v_user uuid := auth.uid();
  v_sign int := CASE WHEN TG_OP = 'DELETE' THEN 1 ELSE -1 END;
  v_item order_items;
BEGIN
  v_item := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT o.restaurant_id INTO v_restaurant FROM public.orders o WHERE o.id = v_item.order_id;
  IF v_restaurant IS NULL THEN RETURN v_item; END IF;

  FOR ing IN
    SELECT mi.inventory_id, mi.quantity::numeric AS quantity
    FROM public.menu_item_ingredients mi
    WHERE mi.menu_item_id = v_item.menu_item_id
    UNION ALL
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