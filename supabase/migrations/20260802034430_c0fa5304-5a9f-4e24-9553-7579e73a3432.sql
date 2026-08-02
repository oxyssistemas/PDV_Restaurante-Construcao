CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: table is only reachable through the SECURITY DEFINER functions below.

CREATE TRIGGER update_login_attempts_updated_at
BEFORE UPDATE ON public.login_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Returns seconds remaining of lockout (0 = allowed)
CREATE OR REPLACE FUNCTION public.login_lock_seconds(_email text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, COALESCE(CEIL(EXTRACT(EPOCH FROM (locked_until - now())))::int, 0))
  FROM public.login_attempts
  WHERE email = lower(trim(_email))
$$;

-- Records a failed attempt, returns seconds of lockout still to serve
CREATE OR REPLACE FUNCTION public.register_login_failure(_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_attempts int;
  v_locked timestamptz;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN RETURN 0; END IF;

  INSERT INTO public.login_attempts (email, attempts, last_attempt_at)
  VALUES (v_email, 1, now())
  ON CONFLICT (email) DO UPDATE
    SET attempts = CASE
          WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
          WHEN public.login_attempts.last_attempt_at < now() - interval '15 minutes' THEN 1
          ELSE public.login_attempts.attempts + 1
        END,
        last_attempt_at = now(),
        locked_until = NULL
  RETURNING attempts INTO v_attempts;

  IF v_attempts >= 5 THEN
    v_locked := now() + interval '5 minutes';
    UPDATE public.login_attempts SET locked_until = v_locked WHERE email = v_email;
    RETURN 300;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_login_attempts(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts WHERE email = lower(trim(_email))
$$;

REVOKE ALL ON FUNCTION public.login_lock_seconds(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_login_failure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_lock_seconds(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_login_failure(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text) TO anon, authenticated, service_role;