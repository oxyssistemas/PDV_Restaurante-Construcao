-- Pedido de conta sem perfil ainda (ex.: conta criada em outro lugar): cria o perfil em vez de só atualizar.
-- Em banco novo não muda nada: a migração anterior já tem o INSERT ... ON CONFLICT.
DO $$
DECLARE d text; v_old text := $x$  UPDATE public.customer_profiles SET
    name = v_name, phone = v_phone,
    address = CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'address_line', '')), '') ELSE address END,
    complement = CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'complement', '')), '') ELSE complement END
  WHERE user_id = _user_id;$x$;
BEGIN
  SELECT pg_get_functiondef('public.create_online_order(text,jsonb,uuid)'::regprocedure) INTO d;
  IF position(v_old in d) = 0 THEN RETURN; END IF;
  d := replace(d, v_old,
$x$  INSERT INTO public.customer_profiles AS cp (user_id, name, phone, address, complement)
  VALUES (_user_id, v_name, v_phone,
    CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'address_line', '')), '') END,
    CASE WHEN v_mode = 'delivery' THEN NULLIF(btrim(COALESCE(_order->>'complement', '')), '') END)
  ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone,
    address = CASE WHEN v_mode = 'delivery' THEN EXCLUDED.address ELSE cp.address END,
    complement = CASE WHEN v_mode = 'delivery' THEN EXCLUDED.complement ELSE cp.complement END;$x$);
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_online_order(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
