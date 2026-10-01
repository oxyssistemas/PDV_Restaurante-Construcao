-- Link de impressoras nuvem (Star CloudPRNT / Epson Server Direct Print): só o admin do restaurante vê ou troca.
CREATE OR REPLACE FUNCTION public.printer_device_token(_printer_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.device_token FROM public.printers p
  WHERE p.id = _printer_id
    AND (public.has_role(auth.uid(), 'super_admin')
         OR (public.has_role(auth.uid(), 'admin') AND p.restaurant_id = public.get_user_restaurant_id(auth.uid())))
$$;

CREATE OR REPLACE FUNCTION public.rotate_printer_token(_printer_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.printers p SET device_token = encode(extensions.gen_random_bytes(24), 'hex')
  WHERE p.id = _printer_id
    AND (public.has_role(auth.uid(), 'super_admin')
         OR (public.has_role(auth.uid(), 'admin') AND p.restaurant_id = public.get_user_restaurant_id(auth.uid())))
  RETURNING p.device_token
$$;

REVOKE EXECUTE ON FUNCTION public.printer_device_token(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rotate_printer_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.printer_device_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_printer_token(uuid) TO authenticated;
