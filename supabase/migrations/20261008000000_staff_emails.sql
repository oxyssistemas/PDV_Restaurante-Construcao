-- E-mail dos funcionários da loja, para o admin reconhecer cada pessoa nas telas Usuários e Permissões.
CREATE OR REPLACE FUNCTION public.staff_emails(_restaurant_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ur.user_id, u.email::text
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.restaurant_id = _restaurant_id
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.user_roles me
        WHERE me.user_id = auth.uid() AND me.restaurant_id = _restaurant_id
          AND me.role IN ('admin', 'manager', 'supervisor')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.staff_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_emails(uuid) TO authenticated;
