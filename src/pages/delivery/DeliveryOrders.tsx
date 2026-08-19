import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bike, Phone, MapPin, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { authorLabel, deliveryStatusLabels } from '@/lib/orders';
import { courierStatusLabels, courierDotClass } from '@/lib/delivery';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const columns: { key: string; label: string; next?: string; nextLabel?: string }[] = [
  { key: 'pending', label: 'Aguardando', next: 'preparing', nextLabel: 'Em preparo' },
  { key: 'preparing', label: 'Em preparo', next: 'out_for_delivery', nextLabel: 'Saiu para entrega' },
  { key: 'out_for_delivery', label: 'Em rota', next: 'delivered', nextLabel: 'Entregue' },
  { key: 'delivered', label: 'Entregues' },
];

export default function DeliveryOrders() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['delivery-orders', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id, quantity, unit_price, status, menu_items(name))')
        .eq('restaurant_id', restaurantId!)
        .eq('order_type', 'delivery')
        .neq('delivery_status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: couriers } = useQuery({
    queryKey: ['couriers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('couriers')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .eq('active', true)
        .order('name');
      return data || [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['delivery-payments', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('order_id, amount')
        .eq('restaurant_id', restaurantId!);
      return data || [];
    },
  });
  const paidOrderIds = new Set((payments || []).map(p => p.order_id));

  const registerPayment = useMutation({
    mutationFn: async ({ order, method }: { order: any; method: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sessão expirada');
      const { error } = await supabase.from('payments').insert({
        order_id: order.id,
        restaurant_id: restaurantId!,
        method: method as any,
        amount: Number(order.total) + Number(order.delivery_fee || 0),
        user_id: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-payments', restaurantId] });
      toast.success('Pagamento registrado no financeiro!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar pagamento.'),
  });

  const assignCourier = useMutation({
    mutationFn: async ({ id, courierId }: { id: string; courierId: string }) => {
      const { error } = await supabase.from('orders').update({ courier_id: courierId }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders', restaurantId] });
      toast.success('Entregador atribuído!');
    },
    onError: () => toast.error('Erro ao atribuir entregador.'),
  });

  useEffect(() => {
    if (!restaurantId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['couriers', restaurantId] });
    };
    const channel = supabase
      .channel('delivery-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers', filter: `restaurant_id=eq.${restaurantId}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status, courierId }: { id: string; status: string; courierId?: string | null }) => {
      const payload: any = { delivery_status: status };
      if (status === 'delivered') payload.status = 'delivered';
      if (status === 'cancelled') payload.status = 'cancelled';
      const { error } = await supabase.from('orders').update(payload).eq('id', id);
      if (error) throw error;

      if (courierId) {
        if (status === 'out_for_delivery') {
          await supabase.from('couriers').update({ status: 'on_route' }).eq('id', courierId);
        } else if (status === 'delivered' || status === 'cancelled') {
          const stillOnRoute = (orders || []).some(
            o => o.id !== id && (o as any).courier_id === courierId && o.delivery_status === 'out_for_delivery'
          );
          if (!stillOnRoute) {
            await supabase.from('couriers').update({ status: 'free' }).eq('id', courierId);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['couriers', restaurantId] });
      toast.success('Status atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pedidos Delivery</h1>

      {!orders?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Bike className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p className="text-lg">Nenhum pedido de delivery</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {columns.map(col => {
            const list = orders.filter(o => o.delivery_status === col.key);
            return (
              <Card key={col.key} className="h-fit">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm uppercase tracking-wide">
                    {col.label}
                    <Badge variant="secondary">{list.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!list.length && <p className="text-xs text-muted-foreground">Vazio</p>}
                  {list.map(o => {
                    const items = (o as any).order_items || [];
                    const activeItems = items.filter((i: any) => i.status !== 'cancelled');
                    const isReady = activeItems.length > 0 && activeItems.every((i: any) => ['ready', 'delivered'].includes(i.status));
                    const courierId = (o as any).courier_id as string | null;
                    const blockRoute = col.next === 'out_for_delivery' && (!isReady || !courierId);
                    return (
                      <div key={o.id} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold">{o.customer_name || 'Cliente'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(o.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        {o.customer_phone && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" /> {o.customer_phone}
                          </div>
                        )}
                        {o.customer_address && (
                          <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {o.customer_address}
                          </div>
                        )}
                        <ul className="mt-2 space-y-0.5 text-xs">
                          {items.map((i: any) => (
                            <li key={i.id}>{i.quantity}x {i.menu_items?.name}</li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between text-sm font-bold">
                          <span>Total</span>
                          <span>R$ {(Number(o.total) + Number(o.delivery_fee || 0)).toFixed(2)}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Lançado por {authorLabel(o as any)} · {deliveryStatusLabels[o.delivery_status]}
                        </div>
                        <Select
                          value={(o as any).courier_id || undefined}
                          onValueChange={v => assignCourier.mutate({ id: o.id, courierId: v })}
                        >
                          <SelectTrigger className="mt-2 h-8 text-xs">
                            <SelectValue placeholder="Atribuir entregador" />
                          </SelectTrigger>
                          <SelectContent>
                            {(couriers || []).map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                <span className="flex items-center gap-2">
                                  <span className={cn('h-2 w-2 rounded-full', courierDotClass(c.status))} />
                                  {c.name} · {courierStatusLabels[c.status]}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="mt-2 flex gap-2">
                          {col.next && (
                            <Button size="sm" className="flex-1 gap-1" disabled={setStatus.isPending || blockRoute}
                              title={blockRoute ? (!courierId ? 'Atribua um entregador' : 'Aguardando a cozinha marcar como pronto') : undefined}
                              onClick={() => setStatus.mutate({ id: o.id, status: col.next!, courierId })}>
                              <CheckCircle2 className="h-3 w-3" />{' '}
                              {blockRoute ? (!courierId ? 'Sem entregador' : 'Aguardando cozinha') : col.nextLabel}
                            </Button>
                          )}
                          {col.key !== 'delivered' && (
                            <Button size="sm" variant="ghost" className="text-destructive" title="Cancelar"
                              onClick={() => setStatus.mutate({ id: o.id, status: 'cancelled', courierId })}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
