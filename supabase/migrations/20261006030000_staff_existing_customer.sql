-- Funcionário com email que já é cliente de alguma loja: usa a mesma conta (a senha continua a dele).
CREATE OR REPLACE FUNCTION public.auth_user_by_email(_email text)
RETURNS TABLE (id uuid, is_customer boolean, roles text[], is_super boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id,
         (EXISTS (SELECT 1 FROM public.customer_profiles c WHERE c.user_id = u.id)
          OR COALESCE(u.raw_user_meta_data ->> 'kind', '') = 'store_customer'
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.user_id = u.id)),
         COALESCE((SELECT array_agg(r.role::text || ':' || COALESCE(r.restaurant_id::text, '')) FROM public.user_roles r WHERE r.user_id = u.id), '{}'),
         EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'super_admin')
    FROM auth.users u
   WHERE lower(u.email) = lower(trim(_email)) AND u.deleted_at IS NULL
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_by_email(text) TO service_role;
