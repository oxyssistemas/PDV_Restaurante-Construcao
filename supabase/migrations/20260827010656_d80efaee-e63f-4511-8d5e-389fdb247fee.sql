GRANT SELECT, INSERT, UPDATE ON public.fiscal_profiles TO authenticated;
GRANT ALL ON public.fiscal_profiles TO service_role;
REVOKE SELECT (csc_token) ON public.fiscal_profiles FROM authenticated;