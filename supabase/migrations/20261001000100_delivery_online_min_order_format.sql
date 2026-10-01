-- Pedido mínimo com vírgula (R$ 10,00). Em banco novo não muda nada: a migração anterior já tem o formato certo.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.create_online_order(text,jsonb)'::regprocedure) INTO d;
  d := replace(d, $x$to_char(v_store.min_order, 'FM999990D00')$x$, $x$replace(to_char(v_store.min_order, 'FM999990.00'), '.', ',')$x$);
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_online_order(text, jsonb) FROM PUBLIC, anon, authenticated;
