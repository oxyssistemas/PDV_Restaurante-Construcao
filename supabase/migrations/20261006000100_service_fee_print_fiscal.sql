-- Taxa de serviço e couvert: entram na conta "paga", no recibo impresso e na NFC-e automática.

CREATE OR REPLACE FUNCTION public.print_order_header(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object(
    'id', o.id, 'created_at', o.created_at, 'order_type', o.order_type, 'table_number', t.number,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone, 'customer_address', o.customer_address,
    'notes', o.notes, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'service_fee', o.service_fee, 'couvert_total', o.couvert_total, 'people_count', o.people_count,
    'service_percent', s.service_percent, 'couvert_label', s.couvert_label,
    'created_by_name', o.created_by_name, 'created_by_role', o.created_by_role, 'source', o.source)
  FROM public.orders o
  LEFT JOIN public.restaurant_tables t ON t.id = o.table_id
  LEFT JOIN public.service_settings s ON s.restaurant_id = o.restaurant_id
  WHERE o.id = _order_id
$function$;

DO $$
DECLARE d text; a text; b text; c text; e text;
BEGIN
  SELECT pg_get_functiondef('public.on_payment_recorded()'::regprocedure) INTO d;
  IF position('service_fee' in d) > 0 THEN RETURN; END IF;
  a := $x$GREATEST(v_items_total + COALESCE(v_order.delivery_fee, 0), COALESCE(v_order.total, 0))$x$;
  b := $x$GREATEST(v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), COALESCE(v_order.total, 0))$x$;
  c := $x$v_items_total + COALESCE(v_order.delivery_fee, 0), 0, v_items_total + COALESCE(v_order.delivery_fee, 0),$x$;
  e := $x$v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0), 0,
            v_items_total + COALESCE(v_order.delivery_fee, 0) + COALESCE(v_order.service_fee, 0) + COALESCE(v_order.couvert_total, 0),$x$;
  IF position(a in d) = 0 OR position(c in d) = 0 THEN RAISE EXCEPTION 'on_payment_recorded: trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a, b), c, e);
END $$;
REVOKE EXECUTE ON FUNCTION public.on_payment_recorded() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.print_order_header(uuid) FROM PUBLIC, anon, authenticated;
