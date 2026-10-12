import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownRight, ArrowUpRight, Download, Loader2 } from 'lucide-react';
import { differenceInCalendarDays, endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { brl, downloadCsv, paymentMethodLabel } from '@/lib/finance';
import { sourceLabel } from '@/components/delivery/SourceBadge';
import { useServiceSettings } from '@/lib/serviceCharge';
import { cn } from '@/lib/utils';

type Order = {
  id: string; created_at: string; created_by: string | null; created_by_name: string | null; created_by_role: string | null;
  waiter_id: string | null; service_fee: number | null; total: number; discount: number; delivery_fee: number; couvert_total: number | null;
  order_type: string; source: string | null; status: string; customer_name: string | null; table_id: string | null;
};
type Payment = { order_id: string; amount: number; method: string; created_at: string };

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const pct = (now: number, before: number) => (before ? ((now - before) / before) * 100 : now ? 100 : 0);
/** hora e dia da semana no horário de Brasília */
const local = (ts: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hour: Number(p.hour) };
};

/** Busca paginada (o banco devolve até 1000 linhas por vez). */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000) {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function load(restaurantId: string, from: string, to: string) {
  const [orders, payments] = await Promise.all([
    fetchAll<Order>((a, b) => supabase.from('orders')
      .select('id, created_at, created_by, created_by_name, created_by_role, waiter_id, service_fee, total, discount, delivery_fee, couvert_total, order_type, source, status, customer_name, table_id')
      .eq('restaurant_id', restaurantId).neq('status', 'cancelled')
      .gte('created_at', `${from}T00:00:00-03:00`).lte('created_at', `${to}T23:59:59-03:00`).order('created_at').range(a, b) as never),
    fetchAll<Payment>((a, b) => supabase.from('payments').select('order_id, amount, method, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', `${from}T00:00:00-03:00`).lte('created_at', `${to}T23:59:59-03:00`).order('created_at').range(a, b) as never),
  ]);
  return { orders: orders.map(o => ({ ...o, total: Number(o.total), discount: Number(o.discount || 0), delivery_fee: Number(o.delivery_fee || 0) })), payments: payments.map(p => ({ ...p, amount: Number(p.amount) })) };
}

/** Relatórios de gestão: garçons (comissão), horários de pico, comparativo de períodos e exportação para o contador. */
export default function AdvancedReports({ restaurantId }: { restaurantId: string }) {
  const today = new Date();
  const [from, setFrom] = useState(iso(startOfMonth(today)));
  const [to, setTo] = useState(iso(today));
  const { data: service } = useServiceSettings(restaurantId);

  const days = Math.max(1, differenceInCalendarDays(new Date(`${to}T12:00`), new Date(`${from}T12:00`)) + 1);
  const prevTo = iso(subDays(new Date(`${from}T12:00`), 1));
  const prevFrom = iso(subDays(new Date(`${from}T12:00`), days));

  const { data, isLoading } = useQuery({
    queryKey: ['advanced-reports', restaurantId, from, to],
    queryFn: async () => ({ now: await load(restaurantId, from, to), before: await load(restaurantId, prevFrom, prevTo) }),
  });

  const net = (o: Order) => o.total - o.discount;

  // Curva ABC: pratos por faturamento (A = 80% do total, B = os próximos 15%, C = o resto)
  const { data: abc } = useQuery({
    queryKey: ['abc-curve', restaurantId, from, to],
    queryFn: async () => {
      const rows = await fetchAll<{ quantity: number; unit_price: number; menu_items: { name: string } | null }>((a, b) => supabase.from('order_items')
        .select('quantity, unit_price, menu_items(name), orders!inner(restaurant_id)').eq('orders.restaurant_id', restaurantId).neq('status', 'cancelled')
        .gte('created_at', `${from}T00:00:00-03:00`).lte('created_at', `${to}T23:59:59-03:00`).range(a, b) as never);
      const map = new Map<string, { qty: number; total: number }>();
      rows.forEach(r => {
        const name = r.menu_items?.name ?? 'Item removido';
        const cur = map.get(name) ?? { qty: 0, total: 0 };
        cur.qty += Number(r.quantity); cur.total += Number(r.quantity) * Number(r.unit_price);
        map.set(name, cur);
      });
      const list = Array.from(map, ([name, v]) => ({ name, ...v })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
      const sum = list.reduce((s, x) => s + x.total, 0) || 1;
      let acc = 0;
      return list.map(x => {
        acc += x.total;
        const share = acc / sum;
        return { ...x, pct: (x.total / sum) * 100, acc: share * 100, cls: share <= 0.8 || acc === x.total ? 'A' : share <= 0.95 ? 'B' : 'C' };
      });
    },
  });

  const waiters = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; orders: number; sales: number; service: number }>();
    data.now.orders.filter(o => o.order_type === 'dine_in').forEach(o => {
      const key = o.waiter_id || o.created_by || o.created_by_name || 'sem';
      const cur = map.get(key) ?? { name: o.created_by_name || 'Sem nome', orders: 0, sales: 0, service: 0 };
      cur.orders += 1; cur.sales += net(o); cur.service += Number(o.service_fee || 0);
      map.set(key, cur);
    });
    const percent = Number(service?.waiter_commission_percent || 0);
    const base = service?.waiter_commission_base ?? 'service';
    return Array.from(map.values()).map(w => ({ ...w, commission: Math.round((base === 'service' ? w.service : w.sales) * percent) / 100 }))
      .sort((a, b) => b.sales - a.sales);
  }, [data, service]);

  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    data?.now.payments.forEach(p => { const { dow, hour } = local(p.created_at); grid[dow][hour] += p.amount; });
    const max = Math.max(1, ...grid.flat());
    const hours = Array.from({ length: 24 }, (_, h) => h).filter(h => grid.some(r => r[h] > 0));
    return { grid, max, hours: hours.length ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i) : [] };
  }, [data]);

  const compare = useMemo(() => {
    if (!data) return null;
    const stats = (d: { orders: Order[]; payments: Payment[] }) => {
      const revenue = d.payments.reduce((s, p) => s + p.amount, 0);
      const paidOrders = new Set(d.payments.map(p => p.order_id)).size;
      const byChannel = new Map<string, number>();
      d.orders.forEach(o => {
        const ch = o.order_type === 'dine_in' ? 'Salão' : o.order_type === 'delivery' ? `Delivery · ${sourceLabel(o.source)}` : 'Balcão / retirada';
        byChannel.set(ch, (byChannel.get(ch) ?? 0) + net(o) + o.delivery_fee);
      });
      return { revenue, orders: paidOrders, ticket: paidOrders ? revenue / paidOrders : 0, discount: d.orders.reduce((s, o) => s + o.discount, 0), byChannel };
    };
    return { now: stats(data.now), before: stats(data.before) };
  }, [data]);

  const exportWaiters = () => downloadCsv(`garcons-${from}-a-${to}.csv`, [
    ['Garçom', 'Comandas', 'Vendas', 'Taxa de serviço', 'Comissão'],
    ...waiters.map(w => [w.name, w.orders, w.sales.toFixed(2), w.service.toFixed(2), w.commission.toFixed(2)]),
  ]);

  /** Planilha para o contador: um pedido por linha, com data, canal, valores e formas de pagamento. */
  const exportAccountant = () => {
    if (!data) return;
    const pays = new Map<string, Record<string, number>>();
    data.now.payments.forEach(p => { const m = pays.get(p.order_id) ?? {}; m[p.method] = (m[p.method] ?? 0) + p.amount; pays.set(p.order_id, m); });
    const methods = Object.keys(paymentMethodLabel);
    downloadCsv(`vendas-contador-${from}-a-${to}.csv`, [
      ['Data', 'Hora', 'Pedido', 'Canal', 'Itens', 'Desconto', 'Taxa de serviço', 'Couvert', 'Entrega', 'Total', ...methods.map(m => paymentMethodLabel[m])],
      ...data.now.orders.map(o => {
        const d = new Date(o.created_at);
        const total = net(o) + Number(o.service_fee || 0) + Number(o.couvert_total || 0) + o.delivery_fee;
        const pm = pays.get(o.id) ?? {};
        return [
          d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
          o.id.slice(0, 8).toUpperCase(), o.order_type === 'dine_in' ? 'Salão' : o.order_type === 'delivery' ? `Delivery ${sourceLabel(o.source)}` : 'Balcão',
          o.total.toFixed(2).replace('.', ','), o.discount.toFixed(2).replace('.', ','), Number(o.service_fee || 0).toFixed(2).replace('.', ','),
          Number(o.couvert_total || 0).toFixed(2).replace('.', ','), o.delivery_fee.toFixed(2).replace('.', ','), total.toFixed(2).replace('.', ','),
          ...methods.map(m => (pm[m] ?? 0).toFixed(2).replace('.', ',')),
        ];
      }),
    ]);
  };

  const quick = (f: Date, t: Date) => { setFrom(iso(f)); setTo(iso(t)); };
  const Delta = ({ a, b, money = true }: { a: number; b: number; money?: boolean }) => {
    const d = pct(a, b);
    return (
      <div>
        <div className="text-2xl font-bold">{money ? brl(a) : Math.round(a)}</div>
        <div className={cn('flex items-center gap-1 text-xs', d >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive')}>
          {d >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {Math.abs(d).toFixed(1)}% vs. período anterior ({money ? brl(b) : Math.round(b)})
        </div>
      </div>
    );
  };

  return (
    <Card className="mt-6">
      <CardHeader className="space-y-3">
        <CardTitle className="text-lg">Gestão do período</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label="De" className="h-9 w-[150px]" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
          <span className="text-muted-foreground">até</span>
          <Input type="date" aria-label="Até" className="h-9 w-[150px]" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => quick(startOfMonth(today), today)}>Este mês</Button>
          <Button size="sm" variant="ghost" onClick={() => quick(startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1)))}>Mês passado</Button>
          <Button size="sm" variant="ghost" onClick={() => quick(subDays(today, 6), today)}>7 dias</Button>
          <Button size="sm" variant="outline" className="ml-auto gap-2" disabled={!data} onClick={exportAccountant}><Download className="h-4 w-4" /> Planilha para o contador</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
          <Tabs defaultValue="compare">
            <TabsList className="flex-wrap">
              <TabsTrigger value="compare">Comparativo</TabsTrigger>
              <TabsTrigger value="waiters">Garçons e comissão</TabsTrigger>
              <TabsTrigger value="heat">Horários de pico</TabsTrigger>
              <TabsTrigger value="abc">Curva ABC</TabsTrigger>
            </TabsList>

            <TabsContent value="compare" className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">Comparado com {format(new Date(`${prevFrom}T12:00`), 'dd/MM')} a {format(new Date(`${prevTo}T12:00`), 'dd/MM')} (mesmo número de dias).</p>
              {compare && (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Faturamento recebido</p><Delta a={compare.now.revenue} b={compare.before.revenue} /></div>
                    <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Pedidos pagos</p><Delta a={compare.now.orders} b={compare.before.orders} money={false} /></div>
                    <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Ticket médio</p><Delta a={compare.now.ticket} b={compare.before.ticket} /></div>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Canal</TableHead><TableHead className="text-right">Agora</TableHead><TableHead className="text-right">Antes</TableHead><TableHead className="text-right">Variação</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Array.from(new Set([...compare.now.byChannel.keys(), ...compare.before.byChannel.keys()])).map(ch => {
                        const a = compare.now.byChannel.get(ch) ?? 0, b = compare.before.byChannel.get(ch) ?? 0, d = pct(a, b);
                        return (
                          <TableRow key={ch}>
                            <TableCell>{ch}</TableCell><TableCell className="text-right">{brl(a)}</TableCell><TableCell className="text-right text-muted-foreground">{brl(b)}</TableCell>
                            <TableCell className={cn('text-right', d >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive')}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {compare.now.discount > 0 && <p className="text-sm text-muted-foreground">Descontos de promoções e cupons no período: <b>{brl(compare.now.discount)}</b></p>}
                </>
              )}
            </TabsContent>

            <TabsContent value="waiters" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Comandas do salão por quem abriu. Comissão: {Number(service?.waiter_commission_percent || 0)}% sobre {service?.waiter_commission_base === 'sales' ? 'as vendas' : 'a taxa de serviço'} (Admin → Configurações).
                </p>
                <Button size="sm" variant="outline" className="gap-2" disabled={!waiters.length} onClick={exportWaiters}><Download className="h-4 w-4" /> CSV</Button>
              </div>
              {waiters.length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Garçom</TableHead><TableHead className="text-right">Comandas</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Ticket médio</TableHead><TableHead className="text-right">Taxa de serviço</TableHead><TableHead className="text-right">Comissão</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {waiters.map(w => (
                      <TableRow key={w.name}>
                        <TableCell className="font-medium">{w.name}</TableCell><TableCell className="text-right">{w.orders}</TableCell>
                        <TableCell className="text-right">{brl(w.sales)}</TableCell><TableCell className="text-right">{brl(w.orders ? w.sales / w.orders : 0)}</TableCell>
                        <TableCell className="text-right">{brl(w.service)}</TableCell><TableCell className="text-right font-semibold">{brl(w.commission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-6 text-center text-sm text-muted-foreground">Sem comandas de salão no período.</p>}
            </TabsContent>

            <TabsContent value="abc" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                A: pratos que somam 80% do faturamento (nunca podem faltar) · B: os próximos 15% · C: os 5% finais (avalie tirar do cardápio ou reposicionar).
              </p>
              {abc?.length ? (
                <>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {(['A', 'B', 'C'] as const).map(c => (
                      <span key={c} className="rounded-full border px-3 py-1"><b>{c}</b>: {abc.filter(x => x.cls === c).length} prato(s) · {brl(abc.filter(x => x.cls === c).reduce((s, x) => s + x.total, 0))}</span>
                    ))}
                    <Button size="sm" variant="outline" className="ml-auto gap-2" onClick={() => downloadCsv(`curva-abc-${from}-a-${to}.csv`, [
                      ['Classe', 'Prato', 'Quantidade', 'Faturamento', '% do total', '% acumulado'],
                      ...abc.map(x => [x.cls, x.name, x.qty, x.total.toFixed(2), x.pct.toFixed(1), x.acc.toFixed(1)]),
                    ])}><Download className="h-4 w-4" /> CSV</Button>
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Classe</TableHead><TableHead>Prato</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Faturamento</TableHead><TableHead className="text-right">% total</TableHead><TableHead className="text-right">% acumulado</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {abc.map(x => (
                        <TableRow key={x.name}>
                          <TableCell><span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                            x.cls === 'A' ? 'bg-[hsl(var(--success))] text-white' : x.cls === 'B' ? 'bg-amber-500 text-white' : 'bg-muted')}>{x.cls}</span></TableCell>
                          <TableCell className="font-medium">{x.name}</TableCell><TableCell className="text-right">{x.qty}</TableCell>
                          <TableCell className="text-right">{brl(x.total)}</TableCell><TableCell className="text-right">{x.pct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right text-muted-foreground">{x.acc.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : <p className="py-6 text-center text-sm text-muted-foreground">Sem vendas no período.</p>}
            </TabsContent>

            <TabsContent value="heat" className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">Faturamento recebido por dia da semana e hora (horário de Brasília). Quanto mais forte a cor, mais movimento.</p>
              {heat.hours.length ? (
                <div className="overflow-x-auto">
                  <table className="border-separate border-spacing-1 text-xs">
                    <thead><tr><th />{heat.hours.map(h => <th key={h} className="w-10 font-normal text-muted-foreground">{h}h</th>)}</tr></thead>
                    <tbody>
                      {heat.grid.map((row, d) => (
                        <tr key={d}>
                          <th className="pr-2 text-left font-medium">{WEEK[d]}</th>
                          {heat.hours.map(h => (
                            <td key={h} title={`${WEEK[d]} ${h}h: ${brl(row[h])}`} className="h-8 w-10 rounded text-center"
                              style={{ background: row[h] ? `hsl(var(--primary) / ${0.12 + 0.88 * (row[h] / heat.max)})` : 'hsl(var(--muted))' }}>
                              <span className="sr-only">{brl(row[h])}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="py-6 text-center text-sm text-muted-foreground">Sem pagamentos no período.</p>}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

