-- Delivery: taxa por distância (km), localização dos entregadores em tempo real, ordem de rota e entrega terceirizada.
-- A distância é calculada pelo endereço convertido em coordenadas no servidor (OpenStreetMap), nunca pelo navegador.

ALTER TABLE public.delivery_stores
  ADD COLUMN IF NOT EXISTS fee_mode text NOT NULL DEFAULT 'zones' CHECK (fee_mode IN ('zones', 'distance')),
  ADD COLUMN IF NOT EXISTS fee_base numeric(10,2) NOT NULL DEFAULT 0 CHECK (fee_base >= 0),
  ADD COLUMN IF NOT EXISTS fee_per_km numeric(10,2) NOT NULL DEFAULT 0 CHECK (fee_per_km >= 0),
  ADD COLUMN IF NOT EXISTS fee_free_km numeric(6,2) NOT NULL DEFAULT 0 CHECK (fee_free_km >= 0),
  ADD COLUMN IF NOT EXISTS max_km numeric(6,2) CHECK (max_km IS NULL OR max_km > 0),
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_km numeric(6,2),
  ADD COLUMN IF NOT EXISTS route_seq integer,
  ADD COLUMN IF NOT EXISTS third_party_provider text,
  ADD COLUMN IF NOT EXISTS third_party_tracking text,
  ADD COLUMN IF NOT EXISTS third_party_cost numeric(10,2);

-- endereço → coordenadas (cache para não repetir consultas ao OpenStreetMap)
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  query text PRIMARY KEY,
  lat double precision,
  lng double precision,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY; -- só o servidor usa

-- distância em linha reta (km) com fator de ruas (1,3), usada na taxa por km
CREATE OR REPLACE FUNCTION public.road_km(_lat1 double precision, _lng1 double precision, _lat2 double precision, _lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round((2 * 6371 * asin(sqrt(
    power(sin(radians(_lat2 - _lat1) / 2), 2) + cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)
  )) * 1.3)::numeric, 2)
$$;

-- taxa por distância da loja: base + (km − km inclusos) × valor do km; fora do raio = não entrega
CREATE OR REPLACE FUNCTION public.delivery_fee_by_km(_restaurant_id uuid, _lat double precision, _lng double precision)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.delivery_stores%ROWTYPE; v_km numeric;
BEGIN
  SELECT * INTO s FROM public.delivery_stores WHERE restaurant_id = _restaurant_id;
  IF NOT FOUND OR s.lat IS NULL OR s.lng IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'A loja ainda não configurou o endereço para calcular a entrega.'); END IF;
  IF _lat IS NULL OR _lng IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Não encontramos esse endereço no mapa. Confira rua, número e cidade.'); END IF;
  v_km := public.road_km(s.lat, s.lng, _lat, _lng);
  IF s.max_km IS NOT NULL AND v_km > s.max_km THEN
    RETURN jsonb_build_object('ok', false, 'km', v_km, 'error', 'Endereço fora da área de entrega (' || replace(v_km::text, '.', ',') || ' km).');
  END IF;
  RETURN jsonb_build_object('ok', true, 'km', v_km,
    'fee', round(s.fee_base + GREATEST(v_km - s.fee_free_km, 0) * s.fee_per_km, 2));
END $$;
REVOKE EXECUTE ON FUNCTION public.delivery_fee_by_km(uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_fee_by_km(uuid, double precision, double precision) TO service_role;

-- loja online: com taxa por km, usa as coordenadas que o servidor achou para o endereço
DO $$
DECLARE d text := pg_get_functiondef('public.create_online_order'::regproc);
BEGIN
  IF position('delivery_fee_by_km' in d) = 0 THEN
    d := replace(d, '  v_coupon jsonb;', '  v_coupon jsonb;' || chr(10) || '  v_geo jsonb;');
    d := replace(d, '    IF jsonb_array_length(v_store.zones) > 0 THEN',
'    IF v_store.fee_mode = ''distance'' THEN
      v_geo := public.delivery_fee_by_km(v_store.restaurant_id, (_order->''geo''->>''lat'')::double precision, (_order->''geo''->>''lng'')::double precision);
      IF NOT (v_geo->>''ok'')::boolean THEN RAISE EXCEPTION ''%'', v_geo->>''error''; END IF;
      v_fee := (v_geo->>''fee'')::numeric;
    ELSIF jsonb_array_length(v_store.zones) > 0 THEN');
    d := replace(d, '  RETURNING id INTO v_order;',
'  RETURNING id INTO v_order;
  IF _order ? ''geo'' AND v_mode = ''delivery'' THEN
    UPDATE public.orders SET delivery_lat = (_order->''geo''->>''lat'')::double precision, delivery_lng = (_order->''geo''->>''lng'')::double precision,
           delivery_km = (v_geo->>''km'')::numeric WHERE id = v_order;
  END IF;');
    EXECUTE d;
  END IF;
END $$;

-- localização do entregador (o app do entregador envia enquanto está com entregas)
CREATE TABLE IF NOT EXISTS public.courier_locations (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_locations_restaurant_idx ON public.courier_locations (restaurant_id);
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Restaurant users can view courier locations" ON public.courier_locations FOR SELECT TO authenticated
  USING (user_belongs_to_restaurant((SELECT auth.uid()), restaurant_id) AND is_restaurant_active(restaurant_id));
CREATE POLICY "Couriers share their location" ON public.courier_locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_id AND c.user_id = (SELECT auth.uid()) AND c.restaurant_id = courier_locations.restaurant_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_id AND c.user_id = (SELECT auth.uid()) AND c.restaurant_id = courier_locations.restaurant_id));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'courier_locations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_locations;
  END IF;
END $$;
