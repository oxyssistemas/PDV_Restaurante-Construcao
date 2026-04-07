import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Grid3X3, ShoppingBag, BookOpen, Users } from 'lucide-react';

export default function AdminDashboard() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [tables, orders, menuItems, categories] = await Promise.all([
        supabase.from('restaurant_tables').select('id, status', { count: 'exact' }).eq('restaurant_id', restaurantId!),
        supabase.from('orders').select('id, status', { count: 'exact' }).eq('restaurant_id', restaurantId!).in('status', ['pending', 'preparing']),
        supabase.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', restaurantId!),
        supabase.from('menu_categories').select('id', { count: 'exact' }).eq('restaurant_id', restaurantId!),
      ]);

      const occupiedTables = tables.data?.filter(t => t.status === 'occupied').length || 0;
      return {
        totalTables: tables.count || 0,
        occupiedTables,
        activeOrders: orders.count || 0,
        menuItems: menuItems.count || 0,
        categories: categories.count || 0,
      };
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cards = [
    { title: 'Mesas', value: `${stats?.occupiedTables || 0} / ${stats?.totalTables || 0}`, sub: 'ocupadas', icon: Grid3X3 },
    { title: 'Pedidos Ativos', value: stats?.activeOrders || 0, sub: 'em andamento', icon: ShoppingBag },
    { title: 'Itens no Cardápio', value: stats?.menuItems || 0, sub: `${stats?.categories || 0} categorias`, icon: BookOpen },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
