import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Flame, CheckCircle2, ChefHat } from 'lucide-react';
import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
  preparing: { label: 'Preparando', icon: Flame, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  ready: { label: 'Pronto', icon: CheckCircle2, color: 'bg-green-500/10 text-green-600 border-green-500/30' },
};

type ItemStatus = 'pending' | 'preparing' | 'ready';

export default function KitchenQueue() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(ctx.currentTime + 0.2);
      }, 180);
    } catch {}
  }, []);

  const { data: orderItems, isLoading } = useQuery({
    queryKey: ['kitchen-queue', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('*, menu_items(name), orders!inner(table_id, restaurant_id, restaurant_tables(number))')
        .eq('orders.restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('kitchen-queue-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () => {
        playNotificationSound();
        toast.info('🆕 Novo pedido recebido!', { duration: 4000 });
        queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient, playNotificationSound]);

  const updateStatus = useMutation({
    mutationFn: async ({ itemId, newStatus }: { itemId: string; newStatus: string }) => {
      const { error } = await supabase
        .from('order_items')
        .update({ status: newStatus as any })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      if (vars.newStatus === 'ready') {
        toast.success('✅ Item marcado como pronto — garçom notificado!');
      }
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  });

  const markAllPreparing = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { error } = await supabase
        .from('order_items')
        .update({ status: 'preparing' as any })
        .in('id', itemIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      toast.success('Todos os itens da mesa em preparo!');
    },
    onError: () => toast.error('Erro ao atualizar itens.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Group by order/table
  const grouped = new Map<string, typeof orderItems>();
  orderItems?.forEach(item => {
    const key = (item as any).orders?.table_id || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  });

  const getNextStatus = (current: string): string | null => {
    if (current === 'pending') return 'preparing';
    if (current === 'preparing') return 'ready';
    return null;
  };

  const getNextLabel = (current: string): string => {
    if (current === 'pending') return 'Iniciar';
    if (current === 'preparing') return 'Pronto';
    return '';
  };

  const pendingCount = orderItems?.filter(i => i.status === 'pending').length || 0;
  const preparingCount = orderItems?.filter(i => i.status === 'preparing').length || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Fila de Pedidos</h2>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" /> {pendingCount} pendentes
          </Badge>
          <Badge variant="outline" className="text-sm bg-orange-500/10 text-orange-600 border-orange-500/30">
            <Flame className="h-3 w-3 mr-1" /> {preparingCount} preparando
          </Badge>
        </div>
      </div>

      {grouped.size === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhum pedido pendente</p>
          <p className="text-sm">Novos pedidos aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(grouped.entries()).map(([tableId, items]) => {
            const tableNumber = (items![0] as any).orders?.restaurant_tables?.number || '?';
            const pendingIds = items!.filter(i => i.status === 'pending').map(i => i.id);
            return (
              <Card key={tableId} className="border-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Mesa {tableNumber}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {formatDistanceToNow(new Date(items![0].created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </CardTitle>
                  {pendingIds.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs w-full mt-1"
                      disabled={markAllPreparing.isPending}
                      onClick={() => markAllPreparing.mutate(pendingIds)}
                    >
                      <Flame className="h-3 w-3 mr-1" /> Iniciar todos ({pendingIds.length})
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {items!.map(item => {
                    const status = item.status as ItemStatus;
                    const config = statusConfig[status] || statusConfig.pending;
                    const Icon = config.icon;
                    const nextStatus = getNextStatus(item.status);

                    return (
                      <div key={item.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {item.quantity}x {(item as any).menu_items?.name}
                          </div>
                          {item.notes && (
                            <div className="text-xs text-destructive font-medium mt-0.5">⚠ {item.notes}</div>
                          )}
                          <Badge variant="outline" className={`mt-1 text-[10px] ${config.color}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </div>
                        {nextStatus && (
                          <Button
                            size="sm"
                            variant={nextStatus === 'ready' ? 'default' : 'outline'}
                            className="shrink-0 text-xs"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ itemId: item.id, newStatus: nextStatus })}
                          >
                            {getNextLabel(item.status)}
                          </Button>
                        )}
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
