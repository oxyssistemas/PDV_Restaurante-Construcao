import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Loader2, DollarSign, TrendingUp, Receipt, PiggyBank, AlertTriangle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from 'recharts';
import { format, subDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { brl, paymentMethodLabel } from '@/lib/finance';

const chartConfig = {
  revenue: { label: 'Receita', color: 'hsl(var(--primary))' },
};

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', 'hsl(var(--destructive))'];

export default function FinanceDashboard() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;

  const { data, isLoading } = useQuery({
    queryKey: ['finance-dashboard', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const start30 = format(subDays(now, 29), 'yyyy-MM-dd');
      const today = format(now, 'yyyy-MM-dd');

      const [payRes, movRes, invRes, invMovRes] = await Promise.all([
        supabase.from('payments').select('amount, method, created_at, order_id')
          .eq('restaurant_id', restaurantId!).gte('created_at', `${start30}T00:00:00`),
        supabase.from('cash_movements').select('amount, type, created_at')
          .eq('restaurant_id', restaurantId!).gte('created_at', `${monthStart}T00:00:00`),
        supabase.from('inventory').select('id, name, quantity, minimum_stock, unit, cost_per_unit')
          .eq('restaurant_id', restaurantId!),
        supabase.from('inventory_movements').select('quantity, type, created_at, inventory_id')
          .eq('restaurant_id', restaurantId!).gte('created_at', `${monthStart}T00:00:00`),
      ]);

      const payments = payRes.data || [];
      const inventory = invRes.data || [];
      const costMap = new Map(inventory.map(i => [i.id, Number(i.cost_per_unit || 0)]));

      const daily: { date: string; label: string; revenue: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = subDays(now, i);
        daily.push({ date: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM', { locale: ptBR }), revenue: 0 });
      }
      payments.forEach(p => {
        const day = daily.find(d => d.date === p.created_at.split('T')[0]);
        if (day) day.revenue += Number(p.amount);
      });

      const byMethod = new Map<string, number>();
      payments.forEach(p => byMethod.set(p.method, (byMethod.get(p.method) || 0) + Number(p.amount)));

      const monthPayments = payments.filter(p => p.created_at >= `${monthStart}T00:00:00`);
      const monthRevenue = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
      const todayRevenue = payments
        .filter(p => p.created_at.startsWith(today))
        .reduce((s, p) => s + Number(p.amount), 0);

      const monthCost = (invMovRes.data || [])
        .filter(m => m.type === 'exit')
        .reduce((s, m) => s + Number(m.quantity) * (costMap.get(m.inventory_id) || 0), 0);

      const sangrias = (movRes.data || [])
        .filter(m => m.type === 'sangria')
        .reduce((s, m) => s + Number(m.amount), 0);

      const orderIds = new Set(monthPayments.map(p => p.order_id));
      const avgTicket = orderIds.size ? monthRevenue / orderIds.size : 0;

      const lowStock = inventory.filter(i => Number(i.quantity) <= Number(i.minimum_stock));

      return {
        daily,
        methods: Array.from(byMethod.entries()).map(([method, value]) => ({
          name: paymentMethodLabel[method] || method,
          value,
        })),
        monthRevenue,
        todayRevenue,
        monthCost,
        profit: monthRevenue - monthCost,
        sangrias,
        avgTicket,
        orders: orderIds.size,
        lowStock,
      };
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cards = [
    { title: 'Receita do Mês', value: brl(data?.monthRevenue || 0), sub: `${data?.orders || 0} comandas pagas`, icon: DollarSign },
    { title: 'Custo de Estoque', value: brl(data?.monthCost || 0), sub: 'saídas do mês', icon: Receipt },
    { title: 'Lucro Líquido', value: brl(data?.profit || 0), sub: 'receita - custos', icon: TrendingUp },
    { title: 'Ticket Médio', value: brl(data?.avgTicket || 0), sub: `hoje: ${brl(data?.todayRevenue || 0)}`, icon: PiggyBank },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Dashboard Financeiro</h1>

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

      <div className="grid gap-6 mt-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Receita — últimos 30 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={data?.daily || []} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} />
                <YAxis tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `R$${v}`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => [brl(Number(v)), ' Receita']} />} />
                <Area dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.methods.length ? (
              <>
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => [brl(Number(v)), '']} />} />
                    <Pie data={data.methods} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                      {data.methods.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1 mt-2">
                  {data.methods.map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {m.name}
                      </span>
                      <span className="font-medium">{brl(m.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem pagamentos registrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!!data?.lowStock.length && (
        <Card className="mt-6 border-destructive/40">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Produtos com estoque baixo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.lowStock.map(i => (
              <div key={i.id} className="flex justify-between rounded-lg border p-3 text-sm">
                <span>{i.name}</span>
                <span className="text-destructive font-medium">{Number(i.quantity)} {i.unit}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
