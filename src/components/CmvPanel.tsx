import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2, Search } from 'lucide-react';
import { brl, downloadCsv } from '@/lib/finance';
import { cmvPercent, cmvTone, useCostData } from '@/lib/cmv';
import { cn } from '@/lib/utils';

const pctText = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const qtyText = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

type SoldRow = { menu_item_id: string | null; quantity: number; unit_price: number };

/** Custo do prato e margem (teórico, pela ficha técnica) e CMV realizado nas vendas do período. */
export default function CmvPanel({ restaurantId }: { restaurantId: string }) {
  const { data, isLoading } = useCostData(restaurantId);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState('30');
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<'cmv' | 'margin' | 'name'>('cmv');

  const { data: sold, isLoading: soldLoading } = useQuery({
    queryKey: ['cmv-sold', restaurantId, days],
    queryFn: async () => {
      const since = `${format(subDays(new Date(), Number(days) - 1), 'yyyy-MM-dd')}T00:00:00`;
      const rows: SoldRow[] = [];
      for (let from = 0; from < 50000; from += 1000) {
        const { data: page, error } = await supabase.from('order_items')
          .select('menu_item_id, quantity, unit_price, orders!inner(restaurant_id, status, created_at)')
          .eq('orders.restaurant_id', restaurantId).neq('orders.status', 'cancelled').gte('orders.created_at', since)
          .neq('status', 'cancelled').range(from, from + 999);
        if (error) throw error;
        rows.push(...(page ?? []).map(r => ({ menu_item_id: r.menu_item_id, quantity: Number(r.quantity), unit_price: Number(r.unit_price) })));
        if ((page ?? []).length < 1000) break;
      }
      return rows;
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.map(it => {
      const c = data.costs.get(it.id)!;
      const price = Number(it.price);
      return { ...it, price, ...c, pct: c.noRecipe ? null : cmvPercent(c.cost, price), margin: price - c.cost };
    });
  }, [data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(r => !q || r.name.toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'margin' ? (a.noRecipe ? 1 : 0) - (b.noRecipe ? 1 : 0) || a.margin - b.margin
      : (b.pct ?? -1) - (a.pct ?? -1));
  }, [rows, search, sort]);

  const realized = useMemo(() => {
    if (!sold || !data) return null;
    let revenue = 0, cost = 0, uncovered = 0;
    const byItem = new Map<string, { qty: number; revenue: number; cost: number }>();
    for (const s of sold) {
      const r = s.quantity * s.unit_price;
      revenue += r;
      const c = s.menu_item_id ? data.costs.get(s.menu_item_id) : undefined;
      if (!c || c.noRecipe) { uncovered += r; continue; }
      cost += s.quantity * c.cost;
      const cur = byItem.get(s.menu_item_id!) ?? { qty: 0, revenue: 0, cost: 0 };
      byItem.set(s.menu_item_id!, { qty: cur.qty + s.quantity, revenue: cur.revenue + r, cost: cur.cost + s.quantity * c.cost });
    }
    const covered = revenue - uncovered;
    return { revenue, cost, covered, uncovered, pct: covered > 0 ? (cost / covered) * 100 : null, byItem };
  }, [sold, data]);

  const withRecipe = rows.filter(r => !r.noRecipe);
  const avgPct = withRecipe.length ? withRecipe.reduce((s, r) => s + (r.pct ?? 0), 0) / withRecipe.length : null;

  const exportCsv = () => downloadCsv(`cmv-${format(new Date(), 'yyyy-MM-dd')}.csv`, [
    ['Item', 'Preço', 'Custo', 'CMV %', 'Margem (R$)', `Vendidos (${days} dias)`, 'Faturamento', 'Custo vendido', 'Observação'],
    ...visible.map(r => {
      const s = realized?.byItem.get(r.id);
      return [r.name, r.price.toFixed(2).replace('.', ','), r.noRecipe ? '' : r.cost.toFixed(2).replace('.', ','),
        r.pct == null ? '' : r.pct.toFixed(1).replace('.', ','), r.noRecipe ? '' : r.margin.toFixed(2).replace('.', ','),
        s ? qtyText(s.qty) : 0, s ? s.revenue.toFixed(2).replace('.', ',') : '', s ? s.cost.toFixed(2).replace('.', ',') : '',
        r.noRecipe ? 'Sem ficha técnica' : r.missingCost ? 'Ingrediente sem custo' : ''];
    }),
  ]);

  if (isLoading || !data) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">CMV médio do cardápio</div>
          <div className={cn('text-2xl font-bold', cmvTone(avgPct))}>{pctText(avgPct)}</div>
          <div className="text-[11px] text-muted-foreground">média dos pratos com ficha técnica</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">CMV realizado ({days} dias)</div>
          <div className={cn('text-2xl font-bold', cmvTone(realized?.pct ?? null))}>{soldLoading ? '…' : pctText(realized?.pct ?? null)}</div>
          <div className="text-[11px] text-muted-foreground">{realized ? `${brl(realized.cost)} de custo sobre ${brl(realized.covered)} vendidos` : ''}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Lucro bruto ({days} dias)</div>
          <div className="text-2xl font-bold">{realized ? brl(realized.covered - realized.cost) : '…'}</div>
          <div className="text-[11px] text-muted-foreground">vendas com ficha técnica menos o custo</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pratos sem ficha técnica</div>
          <div className={cn('text-2xl font-bold', rows.length - withRecipe.length ? 'text-amber-500' : '')}>{rows.length - withRecipe.length}</div>
          <div className="text-[11px] text-muted-foreground">
            {realized && realized.uncovered > 0 ? `${brl(realized.uncovered)} vendidos ficaram fora do CMV` : 'cadastre os ingredientes no item'}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Custo e margem por prato</CardTitle>
            <CardDescription>Custo = ingredientes da ficha técnica × custo unitário no Estoque. Até 30% é saudável; acima de 38% merece revisão.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-48 pl-8" placeholder="Buscar prato" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={sort} onValueChange={v => setSort(v as typeof sort)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cmv">Maior CMV</SelectItem>
                <SelectItem value="margin">Menor margem</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> Planilha</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prato</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">CMV</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Lucro bruto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(r => {
                const s = realized?.byItem.get(r.id);
                const expanded = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(expanded ? null : r.id)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {r.lines.length ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
                          {r.name}
                          {r.is_combo && <Badge variant="secondary">Combo</Badge>}
                          {r.noRecipe && <Badge variant="outline" className="border-amber-500/40 text-amber-500">sem ficha</Badge>}
                          {!r.noRecipe && r.missingCost && (
                            <span title="Algum ingrediente está sem custo no Estoque"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{brl(r.price)}</TableCell>
                      <TableCell className="text-right">{r.noRecipe ? '—' : brl(r.cost)}</TableCell>
                      <TableCell className={cn('text-right font-semibold', cmvTone(r.pct))}>{pctText(r.pct)}</TableCell>
                      <TableCell className={cn('text-right', !r.noRecipe && r.margin < 0 && 'text-destructive')}>{r.noRecipe ? '—' : brl(r.margin)}</TableCell>
                      <TableCell className="text-right">{s ? qtyText(s.qty) : 0}</TableCell>
                      <TableCell className="text-right">{s ? brl(s.revenue - s.cost) : '—'}</TableCell>
                    </TableRow>
                    {expanded && r.lines.length > 0 && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="py-2">
                          <div className="space-y-1 pl-6 text-xs">
                            {r.lines.map((l, i) => (
                              <div key={i} className="flex justify-between gap-3">
                                <span>{qtyText(l.quantity)} {l.unit ?? ''} · {l.name}{l.unitCost <= 0 && <span className="ml-1 text-amber-500">(sem custo)</span>}</span>
                                <span className="text-muted-foreground">{brl(l.unitCost)}/{r.is_combo ? 'un' : l.unit ?? 'un'} = <b className="text-foreground">{brl(l.cost)}</b></span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {!visible.length && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum prato encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        O CMV realizado usa o custo atual dos ingredientes sobre o que foi vendido no período. Para ficar preciso, mantenha o custo unitário atualizado no Estoque a cada compra.
      </p>
    </div>
  );
}
