-- Espelho: lista da equipe (id e email) para entrar no sistema sem internet com email + PIN da central.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  IF position('''staff''' in d) = 0 THEN
    d := replace(d, $x$    'restaurant_id', _restaurant_id,$x$,
$x$    'restaurant_id', _restaurant_id,
    'staff', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('user_id', ur.user_id, 'email', u.email)), '[]')
                FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id WHERE ur.restaurant_id = _restaurant_id),$x$);
    IF position('''staff''' in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho não encontrado'; END IF;
    EXECUTE d;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
