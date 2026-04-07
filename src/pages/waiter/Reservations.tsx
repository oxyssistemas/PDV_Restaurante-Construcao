import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays } from 'lucide-react';

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  no_show: 'Não compareceu',
};

export default function WaiterReservations() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const today = new Date().toISOString().split('T')[0];

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['waiter-reservations', restaurantId, today],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('reservations')
        .select('*, restaurant_tables(number)')
        .eq('restaurant_id', restaurantId!)
        .eq('reservation_date', today)
        .order('start_time');
      return data || [];
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Reservas de Hoje</h1>
      <p className="text-sm text-muted-foreground mb-6">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      {reservations && reservations.length > 0 ? (
        <div className="space-y-3">
          {reservations.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.customer_name}</div>
                  <div className="text-sm text-muted-foreground">
                    Mesa {(r as any).restaurant_tables?.number} • {r.start_time?.slice(0, 5)} - {r.end_time?.slice(0, 5)} • {r.party_size} pessoas
                  </div>
                  {r.notes && <div className="text-xs text-muted-foreground italic mt-1">{r.notes}</div>}
                </div>
                <Badge variant={r.status === 'confirmed' ? 'default' : 'secondary'}>
                  {statusLabels[r.status]}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground mt-8">Nenhuma reserva para hoje.</p>
      )}
    </div>
  );
}
