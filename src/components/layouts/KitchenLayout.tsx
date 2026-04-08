import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, ChefHat } from 'lucide-react';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function KitchenLayout() {
  const { signOut, currentRole } = useAuth();
  const navigate = useNavigate();
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
        (payload) => {
          toast.info('🆕 Novo pedido recebido!', { duration: 4000 });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Cozinha</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate('/login'); }}>
          <LogOut className="h-4 w-4 mr-1" /> Sair
        </Button>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
