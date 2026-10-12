-- Compras e estoque: pedido de compra, entrada pela NF-e de compra (XML), contas a pagar das parcelas e
-- transferência de estoque entre filiais. Tudo que mexe no estoque passa por funções do banco (atômicas).

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  expected_date date,
  notes text,
  items jsonb NOT NULL DEFAULT '[]', -- [{inventory_id, name, unit, quantity, unit_cost}]
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz
);
CREATE INDEX IF NOT EXISTS purchase_orders_restaurant_idx ON public.purchase_orders (restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  access_key text CHECK (access_key IS NULL OR access_key ~ '^\d{44}$'),
  number text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  issued_at timestamptz,
  total numeric(12,2) NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]',
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_key_uniq ON public.purchase_invoices (restaurant_id, access_key) WHERE access_key IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders', 'purchase_invoices'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Restaurant users can view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id))$p$, t);
  END LOOP;
END $$;
CREATE POLICY "Stock managers manage purchase orders" ON public.purchase_orders FOR ALL TO authenticated
  USING (restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id)
         AND (has_role((SELECT auth.uid()), 'admin') OR has_role((SELECT auth.uid()), 'finance')))
  WITH CHECK (restaurant_id = get_user_restaurant_id((SELECT auth.uid())) AND is_restaurant_active(restaurant_id)
         AND (has_role((SELECT auth.uid()), 'admin') OR has_role((SELECT auth.uid()), 'finance')));
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

/*
  Entrada de mercadoria (NF-e de compra ou pedido de compra recebido).
  _p = {
    access_key?, number?, issued_at?, purchase_order_id?,
    supplier: { id? | document?, name? },
    items: [{ inventory_id? | new_name, unit?, quantity (na unidade do estoque), unit_cost (por unidade do estoque), label? }],
    installments?: [{ due_date, amount }]     -- vira contas a pagar
  }
*/
CREATE OR REPLACE FUNCTION public.receive_purchase(_restaurant_id uuid, _p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_supplier uuid;
  v_doc text := regexp_replace(COALESCE(_p->'supplier'->>'document', ''), '\D', '', 'g');
  v_name text := NULLIF(btrim(COALESCE(_p->'supplier'->>'name', '')), '');
  it jsonb;
  v_inv uuid;
  v_qty numeric;
  v_cost numeric;
  v_old public.inventory%ROWTYPE;
  v_total numeric := 0;
  v_count integer := 0;
  v_invoice uuid;
  v_inst jsonb;
  v_n integer := 0;
BEGIN
  IF NOT (public.has_module_access(uid, _restaurant_id, 'inventory', true)) OR NOT public.is_restaurant_active(_restaurant_id) THEN
    RAISE EXCEPTION 'Sem permissão para dar entrada no estoque.';
  END IF;
  IF NULLIF(_p->>'access_key', '') IS NOT NULL AND EXISTS (SELECT 1 FROM public.purchase_invoices WHERE restaurant_id = _restaurant_id AND access_key = _p->>'access_key') THEN
    RAISE EXCEPTION 'Esta nota já foi lançada no estoque.';
  END IF;
  IF jsonb_typeof(_p->'items') <> 'array' OR jsonb_array_length(_p->'items') = 0 THEN RAISE EXCEPTION 'Nenhum item para dar entrada.'; END IF;

  -- fornecedor: o informado, o mesmo CNPJ já cadastrado ou um novo
  v_supplier := NULLIF(_p->'supplier'->>'id', '')::uuid;
  IF v_supplier IS NULL AND v_doc <> '' THEN
    SELECT id INTO v_supplier FROM public.suppliers WHERE restaurant_id = _restaurant_id AND regexp_replace(COALESCE(document, ''), '\D', '', 'g') = v_doc LIMIT 1;
  END IF;
  IF v_supplier IS NULL AND v_name IS NOT NULL THEN
    INSERT INTO public.suppliers (restaurant_id, name, document, category) VALUES (_restaurant_id, left(v_name, 120), NULLIF(v_doc, ''), 'Mercadorias')
    RETURNING id INTO v_supplier;
  END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(_p->'items') LOOP
    v_qty := COALESCE((it->>'quantity')::numeric, 0);
    v_cost := COALESCE((it->>'unit_cost')::numeric, 0);
    CONTINUE WHEN v_qty <= 0;
    v_inv := NULLIF(it->>'inventory_id', '')::uuid;
    IF v_inv IS NULL THEN
      IF length(btrim(COALESCE(it->>'new_name', ''))) < 2 THEN RAISE EXCEPTION 'Escolha o item do estoque para "%".', COALESCE(it->>'label', 'produto'); END IF;
      INSERT INTO public.inventory (restaurant_id, name, quantity, unit, minimum_stock, cost_per_unit)
      VALUES (_restaurant_id, left(btrim(it->>'new_name'), 100), 0, COALESCE(NULLIF(it->>'unit', ''), 'un'), 0, v_cost)
      RETURNING id INTO v_inv;
    END IF;
    SELECT * INTO v_old FROM public.inventory WHERE id = v_inv AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item do estoque não encontrado.'; END IF;
    -- custo médio ponderado
    UPDATE public.inventory SET
      quantity = v_old.quantity + v_qty,
      cost_per_unit = CASE WHEN v_old.quantity > 0 AND v_old.cost_per_unit > 0
                           THEN round((v_old.quantity * v_old.cost_per_unit + v_qty * v_cost) / (v_old.quantity + v_qty), 4)
                           ELSE v_cost END
    WHERE id = v_inv;
    INSERT INTO public.inventory_movements (inventory_id, restaurant_id, type, quantity, reason, user_id)
    VALUES (v_inv, _restaurant_id, 'entry', v_qty,
            left(CASE WHEN NULLIF(_p->>'number', '') IS NOT NULL THEN 'NF-e ' || (_p->>'number') ELSE 'Compra' END
                 || COALESCE(' · ' || v_name, '') || COALESCE(' · ' || (it->>'label'), ''), 200), uid);
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.purchase_invoices (restaurant_id, access_key, number, supplier_id, supplier_name, issued_at, total, items, purchase_order_id, created_by)
  VALUES (_restaurant_id, NULLIF(_p->>'access_key', ''), NULLIF(_p->>'number', ''), v_supplier, v_name,
          NULLIF(_p->>'issued_at', '')::timestamptz, COALESCE(NULLIF(_p->>'total', '')::numeric, round(v_total, 2)), _p->'items',
          NULLIF(_p->>'purchase_order_id', '')::uuid, uid)
  RETURNING id INTO v_invoice;

  IF NULLIF(_p->>'purchase_order_id', '') IS NOT NULL THEN
    UPDATE public.purchase_orders SET status = 'received', received_at = now() WHERE id = (_p->>'purchase_order_id')::uuid AND restaurant_id = _restaurant_id;
  END IF;

  -- parcelas da nota viram contas a pagar
  IF jsonb_typeof(_p->'installments') = 'array' THEN
    FOR v_inst IN SELECT value FROM jsonb_array_elements(_p->'installments') LOOP
      v_n := v_n + 1;
      CONTINUE WHEN COALESCE((v_inst->>'amount')::numeric, 0) <= 0;
      INSERT INTO public.accounts_payable (restaurant_id, supplier_id, description, category, amount, due_date, created_by)
      VALUES (_restaurant_id, v_supplier,
              left('Compra' || COALESCE(' NF ' || NULLIF(_p->>'number', ''), '') || COALESCE(' · ' || v_name, '')
                   || CASE WHEN jsonb_array_length(_p->'installments') > 1 THEN ' (' || v_n || '/' || jsonb_array_length(_p->'installments') || ')' ELSE '' END, 200),
              'Mercadorias', (v_inst->>'amount')::numeric, (v_inst->>'due_date')::date, uid);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('invoice_id', v_invoice, 'items', v_count, 'total', round(v_total, 2), 'supplier_id', v_supplier);
END $$;
REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(uuid, jsonb) TO authenticated;

-- transferência de estoque entre lojas da mesma rede (matriz e filiais)
CREATE OR REPLACE FUNCTION public.transfer_stock(_from uuid, _to uuid, _items jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  root_from uuid; root_to uuid;
  it jsonb; v_src public.inventory%ROWTYPE; v_dst uuid; v_qty numeric; v_n integer := 0;
  v_from_name text; v_to_name text;
BEGIN
  IF _from = _to THEN RAISE EXCEPTION 'Escolha outra loja de destino.'; END IF;
  SELECT COALESCE(parent_id, id), name INTO root_from, v_from_name FROM public.restaurants WHERE id = _from;
  SELECT COALESCE(parent_id, id), name INTO root_to, v_to_name FROM public.restaurants WHERE id = _to;
  IF root_from IS NULL OR root_to IS NULL OR root_from <> root_to THEN RAISE EXCEPTION 'As lojas não são da mesma rede.'; END IF;
  IF NOT public.has_module_access(uid, _from, 'inventory', true) THEN RAISE EXCEPTION 'Sem permissão no estoque da loja de origem.'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Nenhum item para transferir.'; END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((it->>'quantity')::numeric, 0);
    CONTINUE WHEN v_qty <= 0;
    SELECT * INTO v_src FROM public.inventory WHERE id = (it->>'inventory_id')::uuid AND restaurant_id = _from FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado no estoque de origem.'; END IF;
    IF v_src.quantity < v_qty THEN RAISE EXCEPTION 'Saldo insuficiente de % (tem % %).', v_src.name, v_src.quantity, v_src.unit; END IF;
    -- mesmo item no destino (pelo nome e unidade); se não existir, cria
    SELECT id INTO v_dst FROM public.inventory WHERE restaurant_id = _to AND lower(btrim(name)) = lower(btrim(v_src.name)) AND unit = v_src.unit LIMIT 1;
    IF v_dst IS NULL THEN
      INSERT INTO public.inventory (restaurant_id, name, quantity, unit, minimum_stock, cost_per_unit)
      VALUES (_to, v_src.name, 0, v_src.unit, v_src.minimum_stock, v_src.cost_per_unit) RETURNING id INTO v_dst;
    END IF;
    UPDATE public.inventory SET quantity = quantity - v_qty WHERE id = v_src.id;
    UPDATE public.inventory SET quantity = quantity + v_qty WHERE id = v_dst;
    INSERT INTO public.inventory_movements (inventory_id, restaurant_id, type, quantity, reason, user_id) VALUES
      (v_src.id, _from, 'exit', v_qty, left('Transferência para ' || v_to_name || COALESCE(' · ' || NULLIF(btrim(_note), ''), ''), 200), uid),
      (v_dst, _to, 'entry', v_qty, left('Transferência de ' || v_from_name || COALESCE(' · ' || NULLIF(btrim(_note), ''), ''), 200), uid);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('items', v_n);
END $$;
REVOKE EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, jsonb, text) TO authenticated;

-- histórico guarda o item do estoque usado (inclusive o criado), para a próxima nota já vir ligada
DO $$
DECLARE d text := pg_get_functiondef('public.receive_purchase(uuid,jsonb)'::regprocedure);
BEGIN
  IF position('v_saved' in d) = 0 THEN
    d := replace(d, '  v_n integer := 0;', '  v_n integer := 0;' || chr(10) || '  v_saved jsonb := ''[]'';');
    d := replace(d, '    v_total := v_total + v_qty * v_cost;',
      '    v_saved := v_saved || jsonb_build_array(jsonb_set(it, ''{inventory_id}'', to_jsonb(v_inv)));' || chr(10) || '    v_total := v_total + v_qty * v_cost;');
    d := replace(d, 'COALESCE(NULLIF(_p->>''total'', '''')::numeric, round(v_total, 2)), _p->''items'',',
                    'COALESCE(NULLIF(_p->>''total'', '''')::numeric, round(v_total, 2)), v_saved,');
    EXECUTE d;
  END IF;
END $$;
