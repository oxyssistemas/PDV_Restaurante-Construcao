import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Bike, Phone, Navigation, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { courierStatusClasses, courierStatusLabels, courierDotClass, navigationUrl, telUrl } from '@/lib/delivery';

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
        .select('*, order_items(id, quantity, unit_price, menu_items(name))')
        .eq('courier_id', courier!.id)
        .in('delivery_status', ['pending', 'preparing', 'out_for_delivery'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!courier?.id) return;
    const channel = supabase
      .channel('courier-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['courier-orders', courier.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [courier?.id, queryClient]);

  const setOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const payload: any = { delivery_status: status };
      if (status === 'delivered') payload.status = 'delivered';
      const { error } = await supabase.from('orders').update(payload).eq('id', id);
      if (error) throw error;

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

      {!orders?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Bike className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p className="text-lg">Nenhuma entrega atribuída a você</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map(o => {
            const items = (o as any).order_items || [];
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold">{o.customer_name || 'Cliente'}</span>
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
                    <li key={i.id}>{i.quantity}x {i.menu_items?.name}</li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>R$ {(Number(o.total) + Number(o.delivery_fee || 0)).toFixed(2)}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  {o.delivery_status !== 'out_for_delivery' ? (
                    <Button className="flex-1 gap-2" disabled={setOrderStatus.isPending}
                      onClick={() => setOrderStatus.mutate({ id: o.id, status: 'out_for_delivery' })}>
                      <Navigation className="h-4 w-4" /> Iniciar rota
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
