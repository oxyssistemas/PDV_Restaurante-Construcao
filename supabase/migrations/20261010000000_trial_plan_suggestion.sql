-- Teste grátis: o que a loja realmente usou e o menor plano que cobre esse uso.
-- Funciona também com o teste vencido (a loja bloqueada não lê as próprias tabelas).
CREATE OR REPLACE FUNCTION public.trial_plan_suggestion(_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r uuid := _restaurant_id;
  used text[] := ARRAY[]::text[];
  p record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND restaurant_id = r)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE restaurant_id = r AND order_type IN ('delivery', 'takeaway') AND coalesce(source, '') <> 'kiosk')
     OR EXISTS (SELECT 1 FROM couriers WHERE restaurant_id = r) THEN used := array_append(used, 'delivery'); END IF;
  IF EXISTS (SELECT 1 FROM delivery_stores WHERE restaurant_id = r AND enabled) THEN used := array_append(used, 'online_store'); END IF;
  IF EXISTS (SELECT 1 FROM whatsapp_bot_settings WHERE restaurant_id = r AND enabled) THEN used := array_append(used, 'whatsapp'); END IF;
  IF EXISTS (SELECT 1 FROM ifood_integrations WHERE restaurant_id = r AND enabled) THEN used := array_append(used, 'ifood'); END IF;
  IF EXISTS (SELECT 1 FROM marketplace_integrations WHERE restaurant_id = r AND enabled) THEN used := array_append(used, 'marketplaces'); END IF;
  IF EXISTS (SELECT 1 FROM kiosks WHERE restaurant_id = r) THEN used := array_append(used, 'kiosk'); END IF;
  IF EXISTS (SELECT 1 FROM loyalty_programs WHERE restaurant_id = r AND enabled) THEN used := array_append(used, 'loyalty'); END IF;
  IF EXISTS (SELECT 1 FROM order_reviews WHERE restaurant_id = r) THEN used := array_append(used, 'reviews'); END IF;
  IF EXISTS (SELECT 1 FROM stock_counts WHERE restaurant_id = r) THEN used := array_append(used, 'stock_counts'); END IF;
  IF EXISTS (SELECT 1 FROM menu_item_ingredients WHERE restaurant_id = r) THEN used := array_append(used, 'cmv'); END IF;
  IF EXISTS (SELECT 1 FROM accounts_payable WHERE restaurant_id = r) OR EXISTS (SELECT 1 FROM suppliers WHERE restaurant_id = r) THEN used := array_append(used, 'crm'); END IF;
  IF EXISTS (SELECT 1 FROM employees WHERE restaurant_id = r) THEN used := array_append(used, 'hr'); END IF;
  IF EXISTS (SELECT 1 FROM accountant_exports WHERE restaurant_id = r) THEN used := array_append(used, 'accountant'); END IF;
  IF EXISTS (SELECT 1 FROM marketing_posts WHERE restaurant_id = r) THEN used := array_append(used, 'marketing'); END IF;
  IF EXISTS (SELECT 1 FROM ai_conversations WHERE restaurant_id = r) THEN used := array_append(used, 'ai'); END IF;
  IF EXISTS (SELECT 1 FROM branding_settings WHERE restaurant_id = r
             AND (brand_name IS NOT NULL OR logo_light_url IS NOT NULL OR logo_dark_url IS NOT NULL OR primary_color IS NOT NULL)) THEN used := array_append(used, 'branding'); END IF;
  IF EXISTS (SELECT 1 FROM module_permissions WHERE restaurant_id = r) THEN used := array_append(used, 'permissions'); END IF;
  IF EXISTS (SELECT 1 FROM restaurants WHERE parent_id = r) THEN used := array_append(used, 'branches'); END IF;

  -- menor plano (na ordem dos planos) que tem tudo o que foi usado
  FOR p IN SELECT code, name, price_month, features FROM plans WHERE active ORDER BY sort_order LOOP
    IF NOT EXISTS (SELECT 1 FROM unnest(used) k WHERE (p.features ->> k) = 'false') THEN
      RETURN jsonb_build_object('used', to_jsonb(used), 'plan', jsonb_build_object('code', p.code, 'name', p.name, 'price', p.price_month));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('used', to_jsonb(used), 'plan', NULL);
END $$;
REVOKE ALL ON FUNCTION public.trial_plan_suggestion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trial_plan_suggestion(uuid) TO authenticated;
