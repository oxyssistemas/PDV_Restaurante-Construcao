import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, CheckCircle2, Loader2, LogIn, Network, ShoppingBag, TrendingUp, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { brl, paymentMethodLabel } from '@/lib/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

type StoreRow = {
  id: string; name: string; is_branch: boolean; revenue: number; paid_orders: number; orders: number; cancelled: number;
  items_sold: number; delivery_orders: number; open_orders: number; register_open: boolean;
};
type Summary = {
  stores: StoreRow[];
  days: { day: string; store_id: string; revenue: number }[];
  top_items: { name: string; quantity: number; revenue: number; stores: number }[];
  payment_methods: { method: string; amount: number }[];
};

// cores das lojas no gráfico (legíveis no tema claro e escuro)
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];

const PERIODS = {
  today: { label: 'Hoje', from: () => startOfDay(new Date()) },
  week: { label: '7 dias', from: () => startOfDay(subDays(new Date(), 6)) },
  month: { label: 'Este mês', from: () => startOfMonth(new Date()) },
  d30: { label: '30 dias', from: () => startOfDay(subDays(new Date(), 29)) },
} as const;
type PeriodKey = keyof typeof PERIODS;

/** Painel da rede: todas as lojas que a pessoa administra (dono: matriz e filiais; supervisor: as dele) somadas. */
export default function NetworkPage() {
  const { switchStore, currentRole } = useAuth();
  const [period, setPeriod] = useState<PeriodKey>('week');

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['network-summary', period],
    refetchInterval: 60_000,
    queryFn: async () => {
      const from = PERIODS[period].from();
      const { data, error } = await supabase.rpc('network_summary', { _from: from.toISOString(), _to: new Date().toISOString() });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const totals = useMemo(() => {
    const s = data?.stores ?? [];
    const sum = (k: keyof StoreRow) => s.reduce((a, r) => a + Number(r[k] || 0), 0);
    const revenue = sum('revenue'), paid = sum('paid_orders');
    return {
      revenue, orders: sum('orders'), paid, avg: paid ? revenue / paid : 0, items: sum('items_sold'),
      cancelled: sum('cancelled'), open: sum('open_orders'), delivery: sum('delivery_orders'),
      registers: s.filter(r => r.register_open).length,
    };
  }, [data]);

  // faturamento por dia, uma barra empilhada por loja
  const chart = useMemo(() => {
    if (!data) return { rows: [], config: {} };
    const days = new Map<string, Record<string, number | string>>();
    for (const d of data.days) {
      const row = days.get(d.day) ?? { day: format(parseISO(d.day), 'dd/MM', { locale: ptBR }) };
      row[d.store_id] = Number(d.revenue);
      days.set(d.day, row);
    }
    const config = Object.fromEntries(data.stores.map((s, i) => [s.id, { label: s.name, color: COLORS[i % COLORS.length] }]));
    return { rows: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r), config };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Network className="h-7 w-7 text-primary" /> Painel da rede</h1>
          <p className="text-muted-foreground">Todas as lojas que você administra, somadas{dataUpdatedAt ? ` · atualizado ${format(dataUpdatedAt, 'HH:mm')}` : ''}.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {(Object.keys(PERIODS) as PeriodKey[]).map(k => (
            <Button key={k} size="sm" variant={period === k ? 'default' : 'ghost'} onClick={() => setPeriod(k)} className="h-8">{PERIODS[k].label}</Button>
          ))}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Faturamento" value={brl(totals.revenue)} hint={`${data.stores.length} loja(s)`} />
            <Kpi title="Pedidos" value={String(totals.orders)} hint={`${totals.delivery} delivery · ${totals.cancelled} cancelado(s)`} />
            <Kpi title="Ticket médio" value={brl(totals.avg)} hint={`${totals.paid} conta(s) paga(s)`} />
            <Kpi title="Agora" value={`${totals.open} em andamento`} hint={`${totals.registers} de ${data.stores.length} caixa(s) aberto(s)`} />
          </div>

          <Card className="border-0 shadow-md">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Faturamento por dia</CardTitle>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {chart.rows.length ? (
                <ChartContainer config={chart.config} className="h-[280px] w-full">
                  <BarChart data={chart.rows} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} width={64} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [brl(Number(v)), chart.config[String(name)]?.label ?? name]} />} />
                    {data.stores.map((s, i) => (
                      <Bar key={s.id} dataKey={s.id} stackId="lojas" fill={COLORS[i % COLORS.length]} radius={i === data.stores.length - 1 ? [6, 6, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ChartContainer>
              ) : <p className="py-16 text-center text-muted-foreground">Nenhum pagamento no período.</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {data.stores.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{s.name}</span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader><CardTitle className="text-lg">Lojas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="hidden sm:table-cell">Participação</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead className="text-right">Cancelados</TableHead>
                    <TableHead className="text-right">Agora</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.stores].sort((a, b) => Number(b.revenue) - Number(a.revenue)).map(s => {
                    const share = totals.revenue ? (Number(s.revenue) / totals.revenue) * 100 : 0;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" /> {s.name}
                            {!s.is_branch && <Badge variant="outline" className="text-[10px]">Matriz</Badge>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            {s.register_open ? <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> caixa aberto</> : <><XCircle className="h-3 w-3" /> caixa fechado</>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{brl(Number(s.revenue))}</TableCell>
                        <TableCell className="hidden w-40 sm:table-cell">
                          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${share}%` }} /></div>
                          <span className="text-xs text-muted-foreground">{share.toFixed(0)}%</span>
                        </TableCell>
                        <TableCell className="text-right">{s.orders}</TableCell>
                        <TableCell className="text-right">{brl(s.paid_orders ? Number(s.revenue) / s.paid_orders : 0)}</TableCell>
                        <TableCell className="text-right">{s.cancelled}</TableCell>
                        <TableCell className="text-right">{s.open_orders}</TableCell>
                        <TableCell className="text-right">
                          {s.id !== currentRole?.restaurant_id && (
                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => switchStore(s.id).catch(e => toast.error(e.message))}>
                              <LogIn className="h-3.5 w-3.5" /> Abrir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShoppingBag className="h-5 w-5" /> Mais vendidos na rede</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.top_items.length ? data.top_items.map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{t.name}</span>
                    <span className="shrink-0 text-muted-foreground">{t.quantity} un · <b className="text-foreground">{brl(Number(t.revenue))}</b></span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle className="text-lg">Formas de pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.payment_methods.length ? data.payment_methods.map(p => {
                  const share = totals.revenue ? (Number(p.amount) / totals.revenue) * 100 : 0;
                  return (
                    <div key={p.method} className="text-sm">
                      <div className="flex justify-between"><span>{paymentMethodLabel[p.method] ?? p.method}</span><b>{brl(Number(p.amount))}</b></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${share}%` }} /></div>
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Nenhum pagamento no período.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
