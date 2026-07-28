import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Users, Plus, Eye, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  free: 'bg-green-500/20 border-green-500 text-green-700',
  occupied: 'bg-red-500/20 border-red-500 text-red-700',
  reserved: 'bg-yellow-500/20 border-yellow-500 text-yellow-700',
};

const statusLabels: Record<string, string> = {
  free: 'Livre',
  occupied: 'Ocupada',
  reserved: 'Reservada',
};

export default function TableMap() {
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const { data: tables, isLoading } = useQuery({
    queryKey: ['waiter-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('number');
      if (error) throw error;
      return data;
    },
  });

  // Get active orders per table
  const { data: activeOrders } = useQuery({
    queryKey: ['table-orders', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, total, status, created_at, customer_name')
        .eq('restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  // Group orders by table
  const ordersByTable = new Map<string, typeof activeOrders>();
  activeOrders?.forEach(order => {
    if (!ordersByTable.has(order.table_id)) ordersByTable.set(order.table_id, []);
    ordersByTable.get(order.table_id)!.push(order);
  });

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('table-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['waiter-tables', restaurantId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['table-orders', restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const addOrder = useMutation({
    mutationFn: async (tableId: string) => {
      const table = tables?.find(t => t.id === tableId);
      // If table is free, mark as occupied
      if (table?.status === 'free') {
        const { error: tableError } = await supabase
          .from('restaurant_tables')
          .update({ status: 'occupied' as const })
          .eq('id', tableId);
        if (tableError) throw tableError;
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          table_id: tableId,
          restaurant_id: restaurantId!,
          waiter_id: user!.id,
          status: 'pending' as const,
        })
        .select()
        .single();
      if (orderError) throw orderError;
      return order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success('Comanda criada!');
      navigate(`/waiter/orders/${order.id}`);
    },
    onError: () => {
      toast.error('Não foi possível criar a comanda.');
    },
  });

  const renameOrder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ customer_name: name.trim() || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      setRenaming(null);
      toast.success('Nome da comanda atualizado!');
    },
    onError: () => toast.error('Não foi possível renomear a comanda.'),
  });



  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Mapa de Mesas</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables?.map(table => {
          const tableOrders = ordersByTable.get(table.id) || [];
          const totalTable = tableOrders.reduce((s, o) => s + Number(o.total), 0);

          return (
            <Card
              key={table.id}
              className={cn(
                'border-2 transition-all hover:shadow-lg',
                statusColors[table.status]
              )}
            >
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold mb-1">{table.number}</div>
                <div className="flex items-center justify-center gap-1 text-xs mb-2">
                  <Users className="h-3 w-3" />
                  {table.capacity}
                </div>
                <Badge variant="outline" className="text-xs">
                  {statusLabels[table.status]}
                </Badge>

                {/* Show active orders (comandas) */}
                {tableOrders.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">
                      {tableOrders.length} comanda{tableOrders.length > 1 ? 's' : ''}
                    </div>
                    {tableOrders.map((order, idx) => (
                      <Button
                        key={order.id}
                        size="sm"
                        variant="outline"
                        className="w-full text-xs gap-1"
                        onClick={() => navigate(`/waiter/orders/${order.id}`)}
                      >
                        <Eye className="h-3 w-3" />
                        Comanda {idx + 1} — R$ {Number(order.total).toFixed(2)}
                      </Button>
                    ))}
                    <div className="text-xs font-bold mt-1">
                      Total: R$ {totalTable.toFixed(2)}
                    </div>
                  </div>
                )}

                {/* Add new order button */}
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full text-xs gap-1"
                    onClick={() => addOrder.mutate(table.id)}
                    disabled={addOrder.isPending}
                  >
                    <Plus className="h-3 w-3" />
                    {table.status === 'free' ? 'Abrir Mesa' : 'Nova Comanda'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {(!tables || tables.length === 0) && (
        <p className="text-center text-muted-foreground mt-8">Nenhuma mesa cadastrada. Peça ao admin para configurar as mesas.</p>
      )}
    </div>
  );
}
