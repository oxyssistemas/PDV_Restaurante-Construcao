CREATE POLICY "Admin envia certificado do seu restaurante"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fiscal-certificates'
  AND public.has_role(auth.uid(), 'admin')
  AND public.user_belongs_to_restaurant(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Admin le certificado do seu restaurante"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fiscal-certificates'
  AND public.has_role(auth.uid(), 'admin')
  AND public.user_belongs_to_restaurant(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Admin substitui certificado do seu restaurante"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'fiscal-certificates'
  AND public.has_role(auth.uid(), 'admin')
  AND public.user_belongs_to_restaurant(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Admin remove certificado do seu restaurante"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'fiscal-certificates'
  AND public.has_role(auth.uid(), 'admin')
  AND public.user_belongs_to_restaurant(auth.uid(), ((storage.foldername(name))[1])::uuid)
);