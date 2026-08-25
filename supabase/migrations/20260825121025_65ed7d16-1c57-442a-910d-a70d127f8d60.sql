-- Remove leitura ampla e concede SELECT apenas nas colunas não sensíveis.
REVOKE SELECT ON public.fiscal_profiles FROM authenticated;

GRANT SELECT (
  id, restaurant_id, cnpj, legal_name, trade_name, state_registration,
  municipal_registration, tax_regime, street, number, complement, district,
  city, city_code, state, zip_code, phone, environment, provider,
  nfce_series, nfce_next_number, csc_id, certificate_path,
  certificate_expires_at, certificate_uploaded_at, auto_emit_on_payment,
  default_ncm, default_cfop, default_csosn, default_origin, default_unit,
  active, created_at, updated_at
) ON public.fiscal_profiles TO authenticated;