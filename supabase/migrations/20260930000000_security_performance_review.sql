-- Revisão de segurança e desempenho (advisors do Supabase).
-- Nenhuma mudança de comportamento para o app: só fecha acessos indevidos e acelera consultas.

-- 1) Desbloqueio de login: só o próprio usuário, já autenticado, pode limpar as tentativas do seu e-mail.
--    Antes qualquer visitante podia zerar o bloqueio de qualquer e-mail e continuar tentando senhas.
CREATE OR REPLACE FUNCTION public.clear_login_attempts(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts
  WHERE email = lower(trim(_email))
    AND email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM anon, PUBLIC;

-- 2) Funções de permissão não precisam ser chamadas por visitantes não logados.
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.module_guard(uuid, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_feature(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.module_guard(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_has_feature(uuid, text) TO authenticated, service_role;

-- 3) Políticas RLS: avaliar auth.uid()/auth.jwt() uma vez por consulta, não uma vez por linha.
DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.(uid|jwt)\(\)'
  LOOP
    new_qual  := regexp_replace(p.qual,       '(?<!SELECT )auth\.(uid|jwt)\(\)', '(SELECT auth.\1())', 'g');
    new_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.(uid|jwt)\(\)', '(SELECT auth.\1())', 'g');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF new_qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- 4) Índices para chaves estrangeiras sem índice.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl,
           c.conrelid AS relid,
           c.conkey,
           (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
           (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS colnames,
           rel.relname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
                   left('idx_' || fk.relname || '_' || fk.colnames, 63), fk.tbl, fk.cols);
  END LOOP;
END $$;
