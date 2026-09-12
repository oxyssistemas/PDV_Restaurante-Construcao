CREATE OR REPLACE FUNCTION public.create_qr_order(
  _qr_token uuid,
  _customer_name text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.restaurant_tables%ROWTYPE;
  v_order_id uuid;
  v_item jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_quantity integer;
  v_total numeric := 0;
  v_recent integer;
BEGIN
  IF _customer_name IS NULL OR length(btrim(_customer_name)) < 2 OR length(btrim(_customer_name)) > 80 THEN
    RAISE EXCEPTION 'Informe um nome entre 2 e 80 caracteres.';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 30 THEN
    RAISE EXCEPTION 'O pedido deve conter entre 1 e 30 itens.';
  END IF;

  SELECT rt.* INTO v_table
  FROM public.restaurant_tables rt
  JOIN public.restaurants r ON r.id = rt.restaurant_id
  WHERE rt.qr_token = _qr_token
    AND rt.qr_enabled = true
    AND r.status = 'active'
  FOR UPDATE OF rt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR Code inválido ou pedidos desativados para esta mesa.';
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.orders o
  WHERE o.table_id = v_table.id
    AND o.source = 'qr'
    AND o.created_at > now() - interval '2 minutes';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos.';
  END IF;

  INSERT INTO public.orders (
    restaurant_id, table_id, status, total, customer_name,
    created_by_name, created_by_role, order_type, source
  ) VALUES (
    v_table.restaurant_id, v_table.id, 'pending', 0, btrim(_customer_name),
    'Cliente via QR', 'customer', 'dine_in', 'qr'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    BEGIN
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Quantidade inválida.';
    END;

    IF v_quantity < 1 OR v_quantity > 20 THEN
      RAISE EXCEPTION 'Cada item deve ter quantidade entre 1 e 20.';
    END IF;

    SELECT * INTO v_menu
    FROM public.menu_items mi
    WHERE mi.id = (v_item ->> 'menu_item_id')::uuid
      AND mi.restaurant_id = v_table.restaurant_id
      AND mi.available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um produto escolhido não está mais disponível.';
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, notes, status)
    VALUES (
      v_order_id,
      v_menu.id,
      v_quantity,
      v_menu.price,
      NULLIF(left(btrim(COALESCE(v_item ->> 'notes', '')), 300), ''),
      'pending'
    );

    v_total := v_total + (v_menu.price * v_quantity);
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;
  UPDATE public.restaurant_tables SET status = 'occupied' WHERE id = v_table.id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_qr_order(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_qr_order(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_qr_order(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_order(uuid, text, jsonb) TO service_role;