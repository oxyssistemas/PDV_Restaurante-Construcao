import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Loader2, Grid3X3, ShoppingBag, BookOpen, DollarSign, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const chartConfig = {
  revenue: { label: 'Faturamento', color: 'hsl(var(--primary))' },
};

export default function AdminDashboard() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const [tables, orders, menuItems, categories, dailyPayments] = await Promise.all([
        supabase.from('restaurant_tables').select('id, status', { count: 'exact' }).eq('restaurant_id', restaurantId!),
        supabase.from('orders').select('id, status', { count: 'exact' }).eq('restaurant_id', restaurantId!).in('status', ['pending', 'preparing']),
        supabase.from('menu_items').select('id', { count: 'exact' }).eq('restaurant_id', restaurantId!),
        supabase.from('menu_categories').select('id', { count: 'exact' }).eq('restaurant_id', restaurantId!),
        supabase.from('payments').select('amount').eq('restaurant_id', restaurantId!).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      ]);

      const occupiedTables = tables.data?.filter(t => t.status === 'occupied').length || 0;
      const dailyRevenue = dailyPayments.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      return {
        totalTables: tables.count || 0,
        occupiedTables,
        activeOrders: orders.count || 0,
        menuItems: menuItems.count || 0,
        categories: categories.count || 0,
        dailyRevenue,
      };
    },
  });

  const { data: weeklyData } = useQuery({
    queryKey: ['admin-weekly-revenue', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const days: { date: string; label: string; revenue: number }[] = [];
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const d = subDays(now, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        days.push({
          date: dateStr,
          label: format(d, 'EEE', { locale: ptBR }),
          revenue: 0,
        });
      }

      const startDate = days[0].date;
      const endDate = days[days.length - 1].date;

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, created_at')
        .eq('restaurant_id', restaurantId!)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      payments?.forEach(p => {
        const pDate = p.created_at.split('T')[0];
        const day = days.find(d => d.date === pDate);
        if (day) day.revenue += Number(p.amount);
      });

      return days;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cards = [
    { title: 'Faturamento Hoje', value: `R$ ${(stats?.dailyRevenue || 0).toFixed(2)}`, sub: 'total recebido', icon: DollarSign },
    { title: 'Mesas', value: `${stats?.occupiedTables || 0} / ${stats?.totalTables || 0}`, sub: 'ocupadas', icon: Grid3X3 },
    { title: 'Pedidos Ativos', value: stats?.activeOrders || 0, sub: 'em andamento', icon: ShoppingBag },
    { title: 'Itens no Cardápio', value: stats?.menuItems || 0, sub: `${stats?.categories || 0} categorias`, icon: BookOpen },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Weekly Revenue Chart */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Evolução Semanal</CardTitle>
            <p className="text-sm text-muted-foreground">Faturamento dos últimos 7 dias</p>
          </div>
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {weeklyData && weeklyData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} className="capitalize" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} width={60} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [`R$ ${Number(value).toFixed(2)}`, 'Faturamento']}
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground">
              Sem dados de pagamento para exibir
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
