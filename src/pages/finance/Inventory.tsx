import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, ArrowDown, ArrowUp } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { brl, downloadCsv } from '@/lib/finance';

export default function FinanceInventory() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;

  const { data, isLoading } = useQuery({
    queryKey: ['finance-inventory', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const start = format(subDays(new Date(), 29), 'yyyy-MM-dd');
      const [invRes, movRes] = await Promise.all([
        supabase.from('inventory').select('*').eq('restaurant_id', restaurantId!).order('name'),
        supabase.from('inventory_movements')
          .select('id, type, quantity, reason, created_at, inventory_id')
          .eq('restaurant_id', restaurantId!)
          .gte('created_at', `${start}T00:00:00`)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const inventory = invRes.data || [];
      const nameMap = new Map(inventory.map(i => [i.id, i]));
      const movements = (movRes.data || []).map(m => ({
        ...m,
        item: nameMap.get(m.inventory_id),
      }));

      const stockValue = inventory.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_per_unit || 0), 0);
      const exitCost = movements
        .filter(m => m.type === 'exit')
        .reduce((s, m) => s + Number(m.quantity) * Number(m.item?.cost_per_unit || 0), 0);
      const entryCost = movements
        .filter(m => m.type === 'entry')
        .reduce((s, m) => s + Number(m.quantity) * Number(m.item?.cost_per_unit || 0), 0);
      const low = inventory.filter(i => Number(i.quantity) <= Number(i.minimum_stock));

      return { inventory, movements, stockValue, exitCost, entryCost, low };
    },
  });

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`estoque-${format(new Date(), 'yyyy-MM-dd')}.csv`, [
      ['Produto', 'Quantidade', 'Unidade', 'Estoque mínimo', 'Custo unitário', 'Valor total'],
      ...data.inventory.map(i => [
        i.name, Number(i.quantity), i.unit, Number(i.minimum_stock),
        Number(i.cost_per_unit || 0).toFixed(2),
        (Number(i.quantity) * Number(i.cost_per_unit || 0)).toFixed(2),
      ]),
    ]);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Controle de Estoque</h1>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Valor em estoque</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(data?.stockValue || 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Entradas (30 dias)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(data?.entryCost || 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Consumo (30 dias)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(data?.exitCost || 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Estoque baixo</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data?.low.length || 0}</div></CardContent></Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">Produtos</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.inventory.map(i => {
                const low = Number(i.quantity) <= Number(i.minimum_stock);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-right">{Number(i.quantity)} {i.unit}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{Number(i.minimum_stock)}</TableCell>
                    <TableCell className="text-right">{brl(Number(i.cost_per_unit || 0))}</TableCell>
                    <TableCell className="text-right">{brl(Number(i.quantity) * Number(i.cost_per_unit || 0))}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={low ? 'destructive' : 'secondary'}>{low ? 'Baixo' : 'OK'}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!data?.inventory.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum produto cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">Movimentações (30 dias)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.movements.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">{format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell className="font-medium">{m.item?.name || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-sm ${m.type === 'entry' ? 'text-primary' : 'text-destructive'}`}>
                      {m.type === 'entry' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                      {m.type === 'entry' ? 'Entrada' : 'Saída'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{Number(m.quantity)} {m.item?.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{m.reason || '—'}</TableCell>
                </TableRow>
              ))}
              {!data?.movements.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem movimentações no período</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
