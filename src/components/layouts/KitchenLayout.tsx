import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function KitchenLayout() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;

  useEffect(() => {
    if (!restaurantId) return;

    // Listen for new order items to notify the kitchen
    const channel = supabase
      .channel('kitchen-new-items')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_items',
        },
        () => {
          toast.info('🆕 Novo pedido recebido!', { duration: 4000 });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId]);

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <Outlet />
    </div>
  );
}
