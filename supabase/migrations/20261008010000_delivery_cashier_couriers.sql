-- Delivery e caixa operam os pedidos de entrega: ao sair para entrega / entregar, o status do entregador
-- (livre / em rota) muda junto. Antes só o admin podia gravar em couriers e a mudança falhava em silêncio.
DROP POLICY IF EXISTS "Delivery staff update courier status" ON public.couriers;
CREATE POLICY "Delivery staff update courier status" ON public.couriers
  FOR UPDATE TO authenticated
  USING (
    (public.has_role((SELECT auth.uid()), 'delivery') OR public.has_role((SELECT auth.uid()), 'cashier'))
    AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    AND public.is_restaurant_active(restaurant_id)
  )
  WITH CHECK (
    (public.has_role((SELECT auth.uid()), 'delivery') OR public.has_role((SELECT auth.uid()), 'cashier'))
    AND restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
    AND public.is_restaurant_active(restaurant_id)
  );
