-- Servidor dedicado por loja (recurso contratado): os dados da operação daquela loja passam a morar num servidor
-- instalado na própria loja ("Oxys Servidor"), não na nuvem compartilhada. A nuvem guarda só o controle:
-- quem tem o recurso (super admin decide), endereço do servidor, situação, equipe e login.

-- ---------- servidores ----------
CREATE TABLE IF NOT EXISTS public.dedicated_servers (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,                 -- recurso liberado pelo super admin
  status text NOT NULL DEFAULT 'awaiting'
    CHECK (status IN ('awaiting', 'migrating', 'active', 'suspended')),
  key_hash text UNIQUE,                                  -- chave do servidor instalado (sha256)
  activation_code_hash text,                             -- código de instalação (sha256), uso único
  activation_expires_at timestamptz,
  public_url text,                                       -- endereço pela internet (túnel seguro)
  lan_urls text[] NOT NULL DEFAULT '{}',                 -- endereços na rede da loja
  version text,
  last_seen_at timestamptz,
  migrated_at timestamptz,
  migrated_rows integer,
  cloud_purged_at timestamptz,
  own_supabase_url text,                                 -- Supabase próprio da loja (só o endereço; a chave fica no servidor)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dedicated_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dedicated_servers_super_admin ON public.dedicated_servers;
CREATE POLICY dedicated_servers_super_admin ON public.dedicated_servers FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'));

DROP TRIGGER IF EXISTS update_dedicated_servers_updated_at ON public.dedicated_servers;
CREATE TRIGGER update_dedicated_servers_updated_at BEFORE UPDATE ON public.dedicated_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- para onde a equipe vai depois do login ----------
-- Só o necessário para encaminhar (nunca a chave): situação e endereços do servidor da loja da pessoa.
CREATE OR REPLACE FUNCTION public.my_dedicated_server()
RETURNS TABLE (restaurant_id uuid, status text, public_url text, lan_urls text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.restaurant_id, d.status, d.public_url, d.lan_urls
    FROM public.dedicated_servers d
   WHERE d.enabled
     AND d.status IN ('migrating', 'active')
     AND d.restaurant_id = public.get_user_restaurant_id((SELECT auth.uid()))
$$;
REVOKE EXECUTE ON FUNCTION public.my_dedicated_server() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_dedicated_server() TO authenticated;

-- ---------- estrutura para o servidor: tabelas da loja, ligações, padrões e regras de acesso ----------
-- Tabelas que ficam só na nuvem: controle (offline/servidores/login) e segredos de integrações.
CREATE OR REPLACE FUNCTION public.dedicated_tables()
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(c.relname::text ORDER BY c.relname), '{}')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind = 'r'
     AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'restaurant_id' AND NOT a.attisdropped)
          OR c.relname IN ('order_items'))
     -- controle (fica na nuvem: equipe e login) e segredos de integrações
     AND c.relname NOT IN ('user_roles', 'dedicated_servers', 'offline_hubs', 'offline_op_log', 'login_attempts',
                           'fiscal_provider_accounts', 'marketing_credentials', 'print_agent_keys')
$$;

CREATE OR REPLACE FUNCTION public.dedicated_schema()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tables text[] := public.dedicated_tables() || ARRAY['restaurants', 'plans', 'user_roles'];
BEGIN
  RETURN jsonb_build_object(
    'tables', to_jsonb(public.dedicated_tables()),
    'relations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('table', cl.relname, 'column', a.attname, 'ref_table', rcl.relname, 'ref_column', ra.attname)), '[]')
                    FROM pg_constraint c
                    JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
                    JOIN pg_class rcl ON rcl.oid = c.confrelid
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                    JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
                   WHERE c.contype = 'f' AND cl.relname = ANY(v_tables) AND rcl.relname = ANY(v_tables)),
    'defaults', (SELECT COALESCE(jsonb_object_agg(x.table_name, x.cols), '{}') FROM (
                   SELECT c.table_name, jsonb_object_agg(c.column_name, c.column_default) AS cols
                     FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = ANY(v_tables) AND c.column_default IS NOT NULL
                    GROUP BY c.table_name) x),
    'policies', (SELECT COALESCE(jsonb_agg(jsonb_build_object('table', p.tablename, 'name', p.policyname, 'cmd', p.cmd,
                          'permissive', p.permissive, 'qual', p.qual, 'with_check', p.with_check)), '[]')
                   FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ANY(v_tables))
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.dedicated_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_schema() TO service_role;

-- ---------- migração: os dados da loja, tabela por tabela, em páginas ----------
CREATE OR REPLACE FUNCTION public.dedicated_export(_restaurant_id uuid, _table text, _offset integer DEFAULT 0, _limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_hidden text := CASE _table WHEN 'printers' THEN 'device_token' ELSE '' END;
BEGIN
  IF NOT (_table = ANY(public.dedicated_tables())) THEN RAISE EXCEPTION 'Tabela fora da migração: %', _table; END IF;
  IF _table = 'order_items' THEN
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - %L), ''[]'') FROM (SELECT i.* FROM public.order_items i
                      JOIN public.orders o ON o.id = i.order_id WHERE o.restaurant_id = $1 ORDER BY i.id OFFSET $2 LIMIT $3) t', v_hidden)
      INTO v_rows USING _restaurant_id, _offset, _limit;
  ELSE
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - %L), ''[]'') FROM (SELECT * FROM public.%I WHERE restaurant_id = $1 ORDER BY id OFFSET $2 LIMIT $3) t',
                   v_hidden, _table)
      INTO v_rows USING _restaurant_id, _offset, _limit;
  END IF;
  RETURN v_rows;
END $$;
REVOKE EXECUTE ON FUNCTION public.dedicated_export(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_export(uuid, text, integer, integer) TO service_role;

-- ---------- depois de conferido: apaga da nuvem compartilhada os dados que foram para o servidor ----------
CREATE OR REPLACE FUNCTION public.dedicated_purge_cloud(_restaurant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  n integer;
  total integer := 0;
  v_left text[];
  v_next text[];
  v_pass integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dedicated_servers WHERE restaurant_id = _restaurant_id AND status = 'active' AND migrated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'O servidor dedicado ainda não terminou a migração desta loja.';
  END IF;
  PERFORM set_config('oxys.offline_sync', 'on', true); -- sem impressões/avisos durante a limpeza
  DELETE FROM public.order_items i USING public.orders o WHERE o.id = i.order_id AND o.restaurant_id = _restaurant_id;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- apaga tabela por tabela; a que ainda tem registros ligados fica para a próxima volta
  v_left := array_remove(public.dedicated_tables(), 'order_items');
  WHILE array_length(v_left, 1) > 0 LOOP
    v_pass := v_pass + 1;
    IF v_pass > 20 THEN RAISE EXCEPTION 'Não foi possível limpar: %', array_to_string(v_left, ', '); END IF;
    v_next := '{}';
    FOREACH t IN ARRAY v_left LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE restaurant_id = $1', t) USING _restaurant_id;
        GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      EXCEPTION WHEN foreign_key_violation THEN
        v_next := v_next || t;
      END;
    END LOOP;
    v_left := v_next;
  END LOOP;

  UPDATE public.dedicated_servers SET cloud_purged_at = now() WHERE restaurant_id = _restaurant_id;
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.dedicated_purge_cloud(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedicated_purge_cloud(uuid) TO service_role;

-- ---------- a central offline também passa a ler as regras de acesso direto do banco ----------
DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  a := $x$    'generated_at', now(),$x$;
  b := $x$    'generated_at', now(),
    'policies', (SELECT COALESCE(jsonb_agg(jsonb_build_object('table', p.tablename, 'name', p.policyname, 'cmd', p.cmd,
                   'permissive', p.permissive, 'qual', p.qual, 'with_check', p.with_check)), '[]')
                   FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ANY(v_tables)),$x$;
  IF position('''policies''' in d) = 0 THEN
    IF position(a in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho não encontrado'; END IF;
    EXECUTE replace(d, a, b);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
