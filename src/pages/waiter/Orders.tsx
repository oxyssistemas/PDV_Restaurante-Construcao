import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  preparing: 'secondary',
  ready: 'default',
  delivered: 'default',
  cancelled: 'destructive',
};

export default function WaiterOrders() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tableFilter = searchParams.get('table');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['waiter-orders', restaurantId, tableFilter],
    enabled: !!restaurantId,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*, restaurant_tables(number)')
        .eq('restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false });

      if (tableFilter) {
        query = query.eq('table_id', tableFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('waiter-orders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['waiter-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Pedidos Ativos</h1>
      {orders && orders.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map(order => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg truncate">
                    Mesa {(order as any).restaurant_tables?.number || '?'}
                    {(order as any).customer_name ? ` — ${(order as any).customer_name}` : ''}
                  </CardTitle>
                  <Badge variant={statusVariant[order.status]}>
                    {statusLabels[order.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-3">
                  Total: R$ {Number(order.total).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1"
                  onClick={() => navigate(`/waiter/orders/${order.id}`)}
                >
                  <Eye className="h-3 w-3" /> Ver / Adicionar Itens
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground mt-8">Nenhum pedido ativo no momento.</p>
      )}
    </div>
  );
}
