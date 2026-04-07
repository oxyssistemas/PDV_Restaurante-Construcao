import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Realtime subscription for table status changes
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('table-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['waiter-tables', restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const openTable = useMutation({
    mutationFn: async (tableId: string) => {
      // Set table to occupied
      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' as const })
        .eq('id', tableId);
      if (tableError) throw tableError;

      // Create a new order for this table
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
      toast({ title: 'Mesa aberta!', description: 'Comanda criada com sucesso.' });
      navigate(`/waiter/orders/${order.id}`);
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível abrir a mesa.', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Mapa de Mesas</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables?.map(table => (
          <Card
            key={table.id}
            className={cn(
              'border-2 cursor-pointer transition-all hover:shadow-lg',
              statusColors[table.status]
            )}
            onClick={() => {
              if (table.status === 'free') {
                openTable.mutate(table.id);
              } else if (table.status === 'occupied') {
                // Navigate to active order for this table
                navigate(`/waiter/orders?table=${table.id}`);
              }
            }}
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
              {table.status === 'free' && (
                <div className="mt-2">
                  <Button size="sm" variant="default" className="w-full text-xs gap-1">
                    <Plus className="h-3 w-3" /> Abrir Mesa
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {(!tables || tables.length === 0) && (
        <p className="text-center text-muted-foreground mt-8">Nenhuma mesa cadastrada. Peça ao admin para configurar as mesas.</p>
      )}
    </div>
  );
}
