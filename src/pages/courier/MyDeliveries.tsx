import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pushIfoodStatus } from '@/lib/ifood';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Bike, Phone, Navigation, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { courierStatusClasses, courierStatusLabels, courierDotClass, navigationUrl, routeUrl, telUrl } from '@/lib/delivery';
import { Route as RouteIcon, Satellite } from 'lucide-react';

export default function MyDeliveries() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: courier, isLoading: loadingCourier } = useQuery({
    queryKey: ['my-courier', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('couriers')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['courier-orders', courier?.id],
    enabled: !!courier?.id,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id, quantity, unit_price, status, notes, options_text, menu_items(name))')
        .eq('courier_id', courier!.id)
        .in('delivery_status', ['pending', 'preparing', 'out_for_delivery'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      // ordem da rota montada pelo delivery (quando houver)
      return (data || []).sort((a, b) => (a.route_seq ?? 999) - (b.route_seq ?? 999));
    },
  });

  useEffect(() => {
    if (!courier?.id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['courier-orders', courier.id] });
      queryClient.invalidateQueries({ queryKey: ['my-courier'] });
    };
    const channel = supabase
      .channel('courier-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [courier?.id, queryClient]);

  // localização ao vivo para o mapa do delivery, enquanto houver entrega na rua
  const onRoute = courier?.status === 'on_route' || (orders || []).some(o => o.delivery_status === 'out_for_delivery');
  const [gps, setGps] = useState<'off' | 'on' | 'denied'>('off');
  const lastSent = useRef(0);
  useEffect(() => {
    if (!courier?.id || !onRoute || !('geolocation' in navigator)) { setGps('off'); return; }
    const id = navigator.geolocation.watchPosition(async pos => {
      setGps('on');
      if (Date.now() - lastSent.current < 15_000) return;
      lastSent.current = Date.now();
      await supabase.from('courier_locations').upsert({
        courier_id: courier.id, restaurant_id: courier.restaurant_id, lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed, updated_at: new Date().toISOString(),
      });
    }, () => setGps('denied'), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [courier?.id, courier?.restaurant_id, onRoute]);

  const setOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const payload: any = { delivery_status: status };
      if (status === 'delivered') payload.status = 'delivered';
      const { error } = await supabase.from('orders').update(payload).eq('id', id);
      if (error) throw error;
      await pushIfoodStatus(courier?.restaurant_id, id, status);

      if (courier) {
        const stillOnRoute = (orders || []).some(
          o => o.id !== id && o.delivery_status === 'out_for_delivery'
        );
        const newStatus = status === 'out_for_delivery' ? 'on_route' : (stillOnRoute ? 'on_route' : 'free');
        await supabase.from('couriers').update({ status: newStatus }).eq('id', courier.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-courier'] });
      toast.success('Status atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar entrega.'),
  });

  const toggleAvailability = useMutation({
    mutationFn: async () => {
      const next = courier!.status === 'free' ? 'on_route' : 'free';
      const { error } = await supabase.from('couriers').update({ status: next }).eq('id', courier!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-courier'] }),
    onError: () => toast.error('Erro ao alterar sua situação.'),
  });

  if (loadingCourier || isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!courier) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Bike className="mx-auto mb-4 h-16 w-16 opacity-30" />
        <p className="font-semibold text-foreground">Cadastro de entregador não encontrado</p>
        <p className="text-sm">Peça ao administrador do restaurante para vincular seu acesso.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="mr-auto min-w-0">
          <div className="truncate text-lg font-bold">{courier.name}</div>
          <div className="text-xs text-muted-foreground">
            {[courier.vehicle, courier.plate].filter(Boolean).join(' • ') || 'Veículo não informado'}
          </div>
        </div>
        <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', courierStatusClasses(courier.status))}>
          <span className={cn('h-2 w-2 rounded-full', courierDotClass(courier.status))} />
          {courierStatusLabels[courier.status] || courier.status}
        </span>
        <Button variant="outline" size="sm" disabled={toggleAvailability.isPending} onClick={() => toggleAvailability.mutate()}>
          {courier.status === 'free' ? 'Marcar em rota' : 'Marcar livre'}
        </Button>
      </div>

      {onRoute && (
        <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
          gps === 'denied' ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground')}>
          <Satellite className="h-4 w-4 shrink-0" />
          {gps === 'on' ? 'Sua localização está aparecendo no mapa do delivery.'
            : gps === 'denied' ? 'Libere a localização do celular para a loja acompanhar a entrega.'
            : 'Ligando a localização…'}
        </div>
      )}

      {(orders?.length ?? 0) > 1 && routeUrl(orders!.map(o => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, address: o.customer_address }))) && (
        <Button asChild variant="outline" className="w-full gap-2">
          <a href={routeUrl(orders!.map(o => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, address: o.customer_address })))!} target="_blank" rel="noopener noreferrer">
            <RouteIcon className="h-4 w-4" /> Abrir rota com todas as entregas ({orders!.length})
          </a>
        </Button>
      )}

      {!orders?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Bike className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p className="text-lg">Nenhuma entrega atribuída a você</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map(o => {
            const items = (o as any).order_items || [];
            const activeItems = items.filter((i: any) => i.status !== 'cancelled');
            const isReady = activeItems.length > 0 && activeItems.every((i: any) => ['ready', 'delivered'].includes(i.status));
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold">{o.route_seq ? `${o.route_seq}º · ` : ''}{o.customer_name || 'Cliente'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(o.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>

                {o.customer_address && (
                  <a
                    href={navigationUrl(o.customer_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm text-primary transition-colors hover:bg-primary/20"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">{o.customer_address}</span>
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
                  </a>
                )}

                {o.customer_phone && (
                  <a href={telUrl(o.customer_phone)} className="mt-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <Phone className="h-4 w-4" /> {o.customer_phone}
                  </a>
                )}

                <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                  {items.map((i: any) => (
                    <li key={i.id}>{i.quantity}x {i.menu_items?.name}{i.options_text ? ` (${i.options_text})` : ''}</li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>R$ {(Number(o.total) + Number(o.delivery_fee || 0) - Number(o.discount || 0)).toFixed(2)}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  {o.delivery_status !== 'out_for_delivery' ? (
                    <Button className="flex-1 gap-2" disabled={setOrderStatus.isPending || !isReady}
                      title={isReady ? undefined : 'Aguardando a cozinha marcar o pedido como pronto'}
                      onClick={() => setOrderStatus.mutate({ id: o.id, status: 'out_for_delivery' })}>
                      <Navigation className="h-4 w-4" /> {isReady ? 'Iniciar rota' : 'Aguardando cozinha'}
                    </Button>
                  ) : (
                    <Button className="flex-1 gap-2" disabled={setOrderStatus.isPending}
                      onClick={() => setOrderStatus.mutate({ id: o.id, status: 'delivered' })}>
                      <CheckCircle2 className="h-4 w-4" /> Entregue
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
