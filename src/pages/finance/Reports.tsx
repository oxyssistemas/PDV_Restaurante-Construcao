import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download } from 'lucide-react';
import { format, startOfWeek, startOfMonth, subDays, subMonths, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, endOfWeek, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { brl, downloadCsv, paymentMethodLabel } from '@/lib/finance';

type Period = 'daily' | 'weekly' | 'monthly';

export default function FinanceReports() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const [period, setPeriod] = useState<Period>('daily');

  const { data, isLoading } = useQuery({
    queryKey: ['finance-reports', restaurantId, period],
    enabled: !!restaurantId,
    queryFn: async () => {
      const now = new Date();
      const start =
        period === 'daily' ? subDays(now, 29)
        : period === 'weekly' ? startOfWeek(subDays(now, 7 * 11), { locale: ptBR })
        : startOfMonth(subMonths(now, 11));

      const [payRes, itemsRes] = await Promise.all([
        supabase.from('payments').select('amount, method, created_at, order_id')
          .eq('restaurant_id', restaurantId!)
          .gte('created_at', `${format(start, 'yyyy-MM-dd')}T00:00:00`),
        supabase.from('order_items')
          .select('quantity, unit_price, created_at, status, menu_items(name), orders!inner(restaurant_id)')
          .eq('orders.restaurant_id', restaurantId!)
          .neq('status', 'cancelled')
          .gte('created_at', `${format(start, 'yyyy-MM-dd')}T00:00:00`),
      ]);

      const payments = payRes.data || [];

      const buckets =
        period === 'daily'
          ? eachDayOfInterval({ start, end: now }).map(d => ({
              key: format(d, 'yyyy-MM-dd'),
              label: format(d, "dd 'de' MMM", { locale: ptBR }),
              from: format(d, 'yyyy-MM-dd'),
              to: format(d, 'yyyy-MM-dd'),
            }))
          : period === 'weekly'
          ? eachWeekOfInterval({ start, end: now }, { locale: ptBR }).map(d => ({
              key: format(d, 'yyyy-MM-dd'),
              label: `${format(d, 'dd/MM')} - ${format(endOfWeek(d, { locale: ptBR }), 'dd/MM')}`,
              from: format(d, 'yyyy-MM-dd'),
              to: format(endOfWeek(d, { locale: ptBR }), 'yyyy-MM-dd'),
            }))
          : eachMonthOfInterval({ start, end: now }).map(d => ({
              key: format(d, 'yyyy-MM'),
              label: format(d, "MMMM 'de' yyyy", { locale: ptBR }),
              from: format(d, 'yyyy-MM-dd'),
              to: format(endOfMonth(d), 'yyyy-MM-dd'),
            }));

      const rows = buckets.map(b => {
        const inRange = payments.filter(p => {
          const d = p.created_at.split('T')[0];
          return d >= b.from && d <= b.to;
        });
        const revenue = inRange.reduce((s, p) => s + Number(p.amount), 0);
        const orders = new Set(inRange.map(p => p.order_id)).size;
        const byMethod: Record<string, number> = {};
        inRange.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount); });
        return { ...b, revenue, orders, avgTicket: orders ? revenue / orders : 0, byMethod };
      }).reverse();

      const topItems = new Map<string, { qty: number; total: number }>();
      (itemsRes.data || []).forEach((it: any) => {
        const name = it.menu_items?.name || 'Item removido';
        const cur = topItems.get(name) || { qty: 0, total: 0 };
        cur.qty += Number(it.quantity);
        cur.total += Number(it.quantity) * Number(it.unit_price);
        topItems.set(name, cur);
      });

      const top = Array.from(topItems.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

      const totals = {
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
        orders: rows.reduce((s, r) => s + r.orders, 0),
      };

      return { rows, top, totals };
    },
  });

  const exportCsv = () => {
    if (!data) return;
    const header = ['Período', 'Comandas', 'Receita', 'Ticket Médio', 'Dinheiro', 'Crédito', 'Débito', 'PIX'];
    const body = data.rows.map(r => [
      r.label, r.orders, r.revenue.toFixed(2), r.avgTicket.toFixed(2),
      (r.byMethod.cash || 0).toFixed(2), (r.byMethod.credit_card || 0).toFixed(2),
      (r.byMethod.debit_card || 0).toFixed(2), (r.byMethod.pix || 0).toFixed(2),
    ]);
    downloadCsv(`relatorio-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...body]);
  };

  const label = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }[period];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
        <div className="flex items-center gap-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="daily">Diário</TabsTrigger>
              <TabsTrigger value="weekly">Semanal</TabsTrigger>
              <TabsTrigger value="monthly">Mensal</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Receita do período</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{brl(data?.totals.revenue || 0)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Comandas pagas</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{data?.totals.orders || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ticket médio</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{brl(data?.totals.orders ? data.totals.revenue / data.totals.orders : 0)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Relatório {label}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Comandas</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Ticket Médio</TableHead>
                    {Object.keys(paymentMethodLabel).map(m => (
                      <TableHead key={m} className="text-right">{paymentMethodLabel[m]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.rows.map(r => (
                    <TableRow key={r.key}>
                      <TableCell className="capitalize font-medium">{r.label}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right font-medium">{brl(r.revenue)}</TableCell>
                      <TableCell className="text-right">{brl(r.avgTicket)}</TableCell>
                      {Object.keys(paymentMethodLabel).map(m => (
                        <TableCell key={m} className="text-right text-muted-foreground">{brl(r.byMethod[m] || 0)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Itens mais vendidos</CardTitle></CardHeader>
            <CardContent>
              {data?.top.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top.map(i => (
                      <TableRow key={i.name}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-right">{i.qty}</TableCell>
                        <TableCell className="text-right">{brl(i.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">Sem vendas no período</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
