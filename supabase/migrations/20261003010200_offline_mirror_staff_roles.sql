-- Central offline com as mesmas permissões da nuvem: papéis de cada pessoa da equipe em todos os restaurantes
-- (has_role / get_user_restaurant_id olham todos) e os dados do usuário que o app mostra.
DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  a := $x$    'staff', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('user_id', ur.user_id, 'email', u.email)), '[]')
                FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id WHERE ur.restaurant_id = _restaurant_id),$x$;
  b := $x$    'staff', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'user_id', u.id, 'email', u.email, 'app_metadata', u.raw_app_meta_data, 'user_metadata', u.raw_user_meta_data,
                  'created_at', u.created_at,
                  'roles', (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'role', r.role, 'restaurant_id', r.restaurant_id, 'created_at', r.created_at)
                                             ORDER BY r.created_at, r.id) FROM public.user_roles r WHERE r.user_id = u.id))), '[]')
                FROM auth.users u WHERE u.id IN (SELECT ur.user_id FROM public.user_roles ur WHERE ur.restaurant_id = _restaurant_id)),$x$;
  IF position('''roles''' in d) = 0 THEN
    IF position(a in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho da equipe não encontrado'; END IF;
    EXECUTE replace(d, a, b);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
