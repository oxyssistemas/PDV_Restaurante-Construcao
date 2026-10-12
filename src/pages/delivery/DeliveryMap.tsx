import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Bike, Loader2, LocateFixed, MapPin, Route as RouteIcon, Store } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { planRoute, routeUrl } from '@/lib/delivery';
import { edgeErrorMessage } from '@/lib/functionError';

type Order = {
  id: string; customer_name: string | null; customer_address: string | null; delivery_status: string; courier_id: string | null;
  delivery_lat: number | null; delivery_lng: number | null; delivery_km: number | null; route_seq: number | null; created_at: string;
};

const pin = (color: string, label: string) => L.divIcon({
  className: '',
  html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:9999px;min-width:28px;height:28px;padding:0 6px;display:flex;align-items:center;justify-content:center;font:600 12px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.4)">${label}</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Delivery → Mapa: loja, entregas em aberto e entregadores em tempo real; monta a rota de cada entregador. */
export default function DeliveryMap() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [fitted, setFitted] = useState(false);

  const { data } = useQuery({
    queryKey: ['delivery-map', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [{ data: store }, { data: orders }, { data: couriers }, { data: locs }] = await Promise.all([
        supabase.from('delivery_stores').select('lat, lng, address').eq('restaurant_id', restaurantId!).maybeSingle(),
        supabase.from('orders').select('id, customer_name, customer_address, delivery_status, courier_id, delivery_lat, delivery_lng, delivery_km, route_seq, created_at')
          .eq('restaurant_id', restaurantId!).eq('order_type', 'delivery').is('archived_at', null)
          .in('delivery_status', ['pending', 'preparing', 'out_for_delivery']).order('created_at'),
        supabase.from('couriers').select('id, name, status').eq('restaurant_id', restaurantId!).eq('active', true).order('name'),
        supabase.from('courier_locations').select('*').eq('restaurant_id', restaurantId!),
      ]);
      return { store, orders: (orders ?? []) as Order[], couriers: couriers ?? [], locs: locs ?? [] };
    },
  });

  // entregador se mexendo: atualiza na hora
  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase.channel(`delivery-map-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations', filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ['delivery-map', restaurantId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ['delivery-map', restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; colaboradores do OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  const courierName = useMemo(() => new Map((data?.couriers ?? []).map(c => [c.id, c.name])), [data]);

  useEffect(() => {
    if (!map.current || !layer.current || !data) return;
    layer.current.clearLayers();
    const points: L.LatLngExpression[] = [];
    if (data.store?.lat != null) {
      L.marker([data.store.lat, data.store.lng!], { icon: pin('#111827', '🏠') }).bindPopup('Loja').addTo(layer.current);
      points.push([data.store.lat, data.store.lng!]);
    }
    data.orders.filter(o => o.delivery_lat != null).forEach(o => {
      const color = o.delivery_status === 'out_for_delivery' ? '#2563eb' : o.delivery_status === 'preparing' ? '#d97706' : '#6b7280';
      L.marker([o.delivery_lat!, o.delivery_lng!], { icon: pin(color, o.route_seq ? String(o.route_seq) : '•') })
        .bindPopup(`<b>${esc(o.customer_name || 'Cliente')}</b><br>${esc(o.customer_address || '')}${o.courier_id ? `<br>Entregador: ${esc(courierName.get(o.courier_id) ?? '')}` : ''}`)
        .addTo(layer.current!);
      points.push([o.delivery_lat!, o.delivery_lng!]);
    });
    data.locs.forEach(l => {
      const old = Date.now() - new Date(l.updated_at).getTime() > 10 * 60_000;
      L.marker([l.lat, l.lng], { icon: pin(old ? '#9ca3af' : '#16a34a', '🛵') })
        .bindPopup(`<b>${esc(courierName.get(l.courier_id) ?? 'Entregador')}</b><br>visto ${formatDistanceToNow(new Date(l.updated_at), { addSuffix: true, locale: ptBR })}`)
        .addTo(layer.current!);
      points.push([l.lat, l.lng]);
    });
    if (!fitted && points.length) {
      map.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
      setFitted(true);
    }
  }, [data, courierName, fitted]);

  const locate = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.functions.invoke('delivery-store', { body: { action: 'geocode_orders', restaurantId } });
      const msg = error ? await edgeErrorMessage(error) : (r as { error?: string })?.error;
      if (msg) throw new Error(msg);
      return r as { checked: number; found: number };
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['delivery-map', restaurantId] });
      toast.success(r.checked ? `${r.found} de ${r.checked} endereço(s) encontrados no mapa.` : 'Todos os pedidos já estão no mapa.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Ordena as entregas do entregador (sai da loja e vai sempre para a mais perto). */
  const plan = useMutation({
    mutationFn: async (courierId: string) => {
      const start = data?.store?.lat != null ? { lat: data.store.lat, lng: data.store.lng! } : null;
      const stops = planRoute(start, (data?.orders ?? []).filter(o => o.courier_id === courierId)
        .map(o => ({ ...o, lat: o.delivery_lat, lng: o.delivery_lng, address: o.customer_address })));
      await Promise.all(stops.map((s, i) => supabase.from('orders').update({ route_seq: i + 1 }).eq('id', s.id)));
      return stops;
    },
    onSuccess: stops => {
      qc.invalidateQueries({ queryKey: ['delivery-map', restaurantId] });
      toast.success(`Rota montada com ${stops.length} entrega(s). O entregador já vê a ordem no app.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const missing = (data?.orders ?? []).filter(o => o.delivery_lat == null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa do delivery</h1>
          <p className="text-sm text-muted-foreground">Entregas em aberto e entregadores em tempo real (o entregador precisa estar com o app aberto e a localização liberada).</p>
        </div>
        {missing > 0 && (
          <Button variant="outline" className="gap-2" disabled={locate.isPending} onClick={() => locate.mutate()}>
            {locate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            Localizar {missing} endereço(s) no mapa
          </Button>
        )}
      </div>
      {data && data.store?.lat == null && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Store className="mr-1 inline h-4 w-4" /> A loja ainda não está no mapa. Preencha o endereço completo em Delivery → Loja online e salve.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={box} className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border" role="region" aria-label="Mapa das entregas" />
        <div className="space-y-3">
          {(data?.couriers ?? []).map(c => {
            const mine = (data?.orders ?? []).filter(o => o.courier_id === c.id).sort((a, b) => (a.route_seq ?? 999) - (b.route_seq ?? 999));
            const loc = data?.locs.find(l => l.courier_id === c.id);
            const url = routeUrl(mine.map(o => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, address: o.customer_address })));
            return (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <Bike className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate font-semibold">{c.name}</span>
                    <Badge variant="outline" className="text-[11px]">{mine.length} entrega(s)</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {loc ? `Localização ${formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true, locale: ptBR })}` : 'Sem localização ainda'}
                  </p>
                  {mine.length > 0 && (
                    <ol className="space-y-0.5 text-xs">
                      {mine.map(o => (
                        <li key={o.id} className="flex gap-1">
                          <span className="w-5 shrink-0 font-semibold">{o.route_seq ?? '–'}</span>
                          <span className="min-w-0 flex-1 truncate">{o.customer_name || 'Cliente'}{o.delivery_km != null ? ` · ${Number(o.delivery_km).toFixed(1).replace('.', ',')} km` : ''}</span>
                          {o.delivery_lat == null && <MapPin className="h-3 w-3 shrink-0 text-amber-500" aria-label="Sem localização" />}
                        </li>
                      ))}
                    </ol>
                  )}
                  {mine.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1" disabled={plan.isPending} onClick={() => plan.mutate(c.id)}>
                        <RouteIcon className="h-3.5 w-3.5" /> Montar rota
                      </Button>
                      {url && <Button size="sm" variant="ghost" asChild><a href={url} target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a></Button>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!data?.couriers.length && <p className="text-sm text-muted-foreground">Nenhum entregador ativo.</p>}
        </div>
      </div>
    </div>
  );
}
