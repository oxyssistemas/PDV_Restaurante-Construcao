import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl, downloadCsv } from '@/lib/finance';
import { negativePayrollTypes } from '@/lib/hr';
import ModuleGate from '@/components/ModuleGate';

const groupLabels: Record<string, string> = {
  revenue: 'Receita',
  cogs: 'Custo dos produtos (CMV)',
  payroll: 'Pessoal',
  operating: 'Despesas operacionais',
  other: 'Outras despesas',
};

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function DrePage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <ModuleGate module="dre">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">DRE</h1>
            <p className="text-muted-foreground">Demonstrativo de resultados do período.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          </div>
        </div>

        <DreReport restaurantId={restaurantId} from={from} to={to} />
        <DreCategories restaurantId={restaurantId} />
      </div>
    </ModuleGate>
  );
}

function DreReport({ restaurantId, from, to }: { restaurantId: string; from: string; to: string }) {
  const start = `${from}T00:00:00`;
  const end = `${to}T23:59:59`;

  const { data, isLoading } = useQuery({
    queryKey: ['dre', restaurantId, from, to],
    queryFn: async () => {
      const [payments, movements, payroll, payables, categories] = await Promise.all([
        supabase.from('payments').select('amount, method, order_id, created_at')
          .eq('restaurant_id', restaurantId).gte('created_at', start).lte('created_at', end),
        supabase.from('inventory_movements').select('quantity, type, inventory_id, created_at')
          .eq('restaurant_id', restaurantId).eq('type', 'exit').gte('created_at', start).lte('created_at', end),
        supabase.from('payroll_entries').select('amount, type, status, reference_month')
          .eq('restaurant_id', restaurantId).gte('reference_month', from).lte('reference_month', to),
        supabase.from('accounts_payable').select('amount, category, status, due_date')
          .eq('restaurant_id', restaurantId).neq('status', 'cancelled').gte('due_date', from).lte('due_date', to),
        supabase.from('dre_categories').select('name, group_key').eq('restaurant_id', restaurantId),
      ]);

      const inventoryIds = [...new Set((movements.data || []).map(m => m.inventory_id))];
      let costMap: Record<string, number> = {};
      if (inventoryIds.length) {
        const { data: inv } = await supabase.from('inventory').select('id, cost_per_unit').in('id', inventoryIds);
        costMap = Object.fromEntries((inv || []).map(i => [i.id, Number(i.cost_per_unit) || 0]));
      }

      const revenue = (payments.data || []).reduce((s, p) => s + Number(p.amount), 0);
      const revenueByMethod: Record<string, number> = {};
      for (const p of payments.data || []) revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + Number(p.amount);

      const cogs = (movements.data || []).reduce((s, m) => s + Number(m.quantity) * (costMap[m.inventory_id] || 0), 0);

      const payrollTotal = (payroll.data || [])
        .filter(p => p.status !== 'cancelled')
        .reduce((s, p) => s + Number(p.amount) * (negativePayrollTypes.includes(p.type) ? -1 : 1), 0);

      const groupOf: Record<string, string> = Object.fromEntries(
        (categories.data || []).map(c => [c.name.toLowerCase(), c.group_key])
      );
      const expenseByCategory: Record<string, { total: number; group: string }> = {};
      for (const p of payables.data || []) {
        const key = p.category?.trim() || 'Sem categoria';
        const group = groupOf[key.toLowerCase()] || 'operating';
        expenseByCategory[key] = { total: (expenseByCategory[key]?.total || 0) + Number(p.amount), group };
      }
      const operating = Object.values(expenseByCategory).filter(e => e.group !== 'cogs').reduce((s, e) => s + e.total, 0);
      const payableCogs = Object.values(expenseByCategory).filter(e => e.group === 'cogs').reduce((s, e) => s + e.total, 0);

      return { revenue, revenueByMethod, cogs: cogs + payableCogs, payrollTotal, operating, expenseByCategory };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const gross = data.revenue;
    const grossProfit = gross - data.cogs;
    const result = grossProfit - data.payrollTotal - data.operating;
    return [
      { label: 'Receita bruta', value: gross, kind: 'in' as const, strong: true },
      { label: 'Custo dos produtos (CMV)', value: -data.cogs, kind: 'out' as const },
      { label: 'Lucro bruto', value: grossProfit, kind: 'sub' as const, strong: true },
      { label: 'Pessoal (folha)', value: -data.payrollTotal, kind: 'out' as const },
      { label: 'Despesas operacionais', value: -data.operating, kind: 'out' as const },
      { label: 'Resultado líquido', value: result, kind: 'total' as const, strong: true },
    ];
  }, [data]);

  const exportCsv = () => {
    downloadCsv(`dre-${from}-a-${to}.csv`, [['Linha', 'Valor'], ...rows.map(r => [r.label, r.value.toFixed(2)])]);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const margin = data && data.revenue > 0 ? (rows[rows.length - 1].value / data.revenue) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Receita</p><p className="text-2xl font-bold">{brl(data?.revenue || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Resultado líquido</p><p className={`text-2xl font-bold ${rows[rows.length - 1]?.value >= 0 ? 'text-primary' : 'text-destructive'}`}>{brl(rows[rows.length - 1]?.value || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Margem líquida</p><p className="text-2xl font-bold">{margin.toFixed(1)}%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Demonstrativo</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {rows.map(r => (
            <div key={r.label} className={`flex items-center justify-between border-b py-2 last:border-0 ${r.strong ? 'font-semibold' : ''}`}>
              <span>{r.label}</span>
              <span className={r.value < 0 ? 'text-destructive' : ''}>{brl(r.value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {data && Object.keys(data.expenseByCategory).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Despesas por categoria</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(data.expenseByCategory).sort((a, b) => b[1].total - a[1].total).map(([name, v]) => (
              <div key={name} className="flex items-center justify-between border-b py-2 last:border-0">
                <span>{name} <span className="text-xs text-muted-foreground">({groupLabels[v.group] ?? v.group})</span></span>
                <span>{brl(v.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DreCategories({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('operating');

  const { data: categories } = useQuery({
    queryKey: ['dre-categories', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dre_categories').select('*')
        .eq('restaurant_id', restaurantId).order('sort_order').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Informe o nome da categoria');
      const { error } = await supabase.from('dre_categories').insert({
        restaurant_id: restaurantId, name: name.trim(), group_key: group,
        sort_order: (categories?.length || 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-categories'] }); qc.invalidateQueries({ queryKey: ['dre'] }); setName(''); toast.success('Categoria criada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dre_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-categories'] }); qc.invalidateQueries({ queryKey: ['dre'] }); },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Categorias do DRE</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Relacione as categorias usadas em contas a pagar com os grupos do demonstrativo.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Insumos, Aluguel" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grupo</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(groupLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button className="gap-2" onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <div className="space-y-1">
          {(categories || []).map(c => (
            <div key={c.id} className="flex items-center justify-between border-b py-2 last:border-0">
              <span>{c.name} <span className="text-xs text-muted-foreground">({groupLabels[c.group_key] ?? c.group_key})</span></span>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {(categories || []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
