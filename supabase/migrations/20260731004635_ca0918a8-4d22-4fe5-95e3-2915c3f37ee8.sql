-- 1) Remove anon (public/pre-login) access from all public tables (GraphQL/PostgREST exposure)
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
  END LOOP;
END $$;

-- 2) Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.get_user_restaurant_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_belongs_to_restaurant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_restaurant_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- these are only used internally (triggers) - nobody should call them directly
REVOKE ALL ON FUNCTION public.notify_low_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_inventory_for_order_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- RLS policies reference these helpers, so signed-in users must keep EXECUTE
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_restaurant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 3) Deterministic restaurant scoping
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> 'super_admin'
    AND restaurant_id IS NOT NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_user_restaurant_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id(uuid) TO authenticated;

-- 4) Controlled INSERT path for notifications (restaurant admins only)
DROP POLICY IF EXISTS "Restaurant admins can create notifications" ON public.notifications;
CREATE POLICY "Restaurant admins can create notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR (public.has_role(auth.uid(), 'admin') AND public.user_belongs_to_restaurant(auth.uid(), restaurant_id))
);

-- 5) Prevent restaurant admins from granting/altering admin or super_admin roles
DROP POLICY IF EXISTS "Admins can manage roles in their restaurant" ON public.user_roles;

CREATE POLICY "Admins can view roles in their restaurant"
ON public.user_roles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
);

CREATE POLICY "Admins can add staff roles in their restaurant"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
  AND role NOT IN ('admin', 'super_admin')
);

CREATE POLICY "Admins can update staff roles in their restaurant"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
  AND role NOT IN ('admin', 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
  AND role NOT IN ('admin', 'super_admin')
);

CREATE POLICY "Admins can remove staff roles in their restaurant"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND restaurant_id = public.get_user_restaurant_id(auth.uid())
  AND public.is_restaurant_active(restaurant_id)
  AND role NOT IN ('admin', 'super_admin')
);