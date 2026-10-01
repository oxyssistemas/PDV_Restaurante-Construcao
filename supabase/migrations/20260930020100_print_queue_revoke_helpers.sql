-- Auxiliares usadas só pelos gatilhos: ninguém de fora chama diretamente.
REVOKE EXECUTE ON FUNCTION public.print_restaurant_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.print_order_header(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_kitchen_print() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_payment_recorded() FROM PUBLIC, anon, authenticated;
