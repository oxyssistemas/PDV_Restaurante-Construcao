
CREATE POLICY "Restaurant users can view menu images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'menu-images' AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text);

CREATE POLICY "Admins can upload menu images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-images' AND public.has_role(auth.uid(),'admin')
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text);

CREATE POLICY "Admins can update menu images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-images' AND public.has_role(auth.uid(),'admin')
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text);

CREATE POLICY "Admins can delete menu images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-images' AND public.has_role(auth.uid(),'admin')
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text);
