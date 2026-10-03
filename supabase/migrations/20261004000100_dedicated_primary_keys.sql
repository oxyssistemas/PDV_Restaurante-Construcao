-- Servidor dedicado: algumas tabelas não têm coluna "id" (a chave é o próprio restaurante, ex.: delivery_stores).
-- A exportação ordena pela chave primária real e a estrutura enviada ao servidor informa a chave de cada tabela.
CREATE OR REPLACE FUNCTION public.dedicated_export(_restaurant_id uuid, _table text, _offset integer DEFAULT 0, _limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_hidden text := CASE _table WHEN 'printers' THEN 'device_token' ELSE '' END;
  v_pk text;
BEGIN
  IF NOT (_table = ANY(public.dedicated_tables())) THEN RAISE EXCEPTION 'Tabela fora da migração: %', _table; END IF;
  SELECT a.attname INTO v_pk FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
   WHERE i.indrelid = ('public.' || quote_ident(_table))::regclass AND i.indisprimary;
  IF _table = 'order_items' THEN
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - %L), ''[]'') FROM (SELECT i.* FROM public.order_items i
                      JOIN public.orders o ON o.id = i.order_id WHERE o.restaurant_id = $1 ORDER BY i.id OFFSET $2 LIMIT $3) t', v_hidden)
      INTO v_rows USING _restaurant_id, _offset, _limit;
  ELSE
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - %L), ''[]'') FROM (SELECT * FROM public.%I WHERE restaurant_id = $1 ORDER BY %I OFFSET $2 LIMIT $3) t',
                   v_hidden, _table, COALESCE(v_pk, 'restaurant_id'))
      INTO v_rows USING _restaurant_id, _offset, _limit;
  END IF;
  RETURN v_rows;
END $$;
REVOKE EXECUTE ON FUNCTION public.dedicated_export(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_export(uuid, text, integer, integer) TO service_role;

DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.dedicated_schema()'::regprocedure) INTO d;
  a := $x$    'tables', to_jsonb(public.dedicated_tables()),$x$;
  b := $x$    'tables', to_jsonb(public.dedicated_tables()),
    'primary_keys', (SELECT COALESCE(jsonb_object_agg(c.relname, a.attname), '{}')
                       FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
                       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                      WHERE i.indisprimary AND c.relname = ANY(v_tables)),$x$;
  IF position('primary_keys' in d) = 0 THEN
    IF position(a in d) = 0 THEN RAISE EXCEPTION 'dedicated_schema: trecho não encontrado'; END IF;
    EXECUTE replace(d, a, b);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.dedicated_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_schema() TO service_role;
