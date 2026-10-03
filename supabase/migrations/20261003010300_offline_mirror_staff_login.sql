-- Modo offline com o login de sempre (opção autorizada pelo dono do sistema): a central recebe o hash bcrypt
-- da senha de cada pessoa da equipe (nunca a senha) e a situação da conta. No computador da central esses
-- dados ficam num arquivo separado, criptografado pelo sistema operacional (desktop/hub/credentials.cjs).
DO $$
DECLARE d text; a text; b text;
BEGIN
  SELECT pg_get_functiondef('public.offline_replica(uuid)'::regprocedure) INTO d;
  a := $x$                  'user_id', u.id, 'email', u.email, 'app_metadata', u.raw_app_meta_data, 'user_metadata', u.raw_user_meta_data,$x$;
  b := $x$                  'user_id', u.id, 'email', u.email, 'app_metadata', u.raw_app_meta_data, 'user_metadata', u.raw_user_meta_data,
                  'password_hash', u.encrypted_password, 'confirmed', u.email_confirmed_at IS NOT NULL,
                  'banned_until', u.banned_until, 'deleted', u.deleted_at IS NOT NULL,$x$;
  IF position('password_hash' in d) = 0 THEN
    IF position(a in d) = 0 THEN RAISE EXCEPTION 'offline_replica: trecho da equipe não encontrado'; END IF;
    EXECUTE replace(d, a, b);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.offline_replica(uuid) FROM PUBLIC, anon, authenticated;
