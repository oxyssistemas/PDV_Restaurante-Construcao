import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, EyeOff, FileSpreadsheet, Loader2, Search, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStore } from '@/hooks/useCurrentStore';
import { ROLE_LABELS, isAdminLike } from '@/lib/roles';
import { brl } from '@/lib/finance';
import {
  COUNT_STATUS, STOCK_REASONS, diffOf, downloadStockCountCsv, downloadStockCountPdf, qty,
  type StockCount, type StockCountItem, type StockReason,
} from '@/lib/stockCount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const parseQty = (s: string) => {
  const v = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v;
};
const fmt = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

/** Um balanço: contagem → revisão das diferenças e relatório do responsável → relatório concluído. */
export default function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/finance') ? '/finance' : '/admin';
  const { currentRole, user, stores, switchStore } = useAuth();
  const { store } = useCurrentStore();
  const qc = useQueryClient();
  const [step, setStep] = useState<'count' | 'review'>('count');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['stock-count', id],
    queryFn: async () => {
      const [{ data: count, error }, { data: items, error: e2 }] = await Promise.all([
        supabase.from('stock_counts').select('*').eq('id', id!).maybeSingle(),
        supabase.from('stock_count_items').select('*').eq('count_id', id!).order('name'),
      ]);
      if (error || e2) throw error || e2;
      return { count: count as StockCount | null, items: (items ?? []) as StockCountItem[] };
    },
  });
  const count = data?.count;
  const items = useMemo(() => data?.items ?? [], [data]);
  const storeName = stores.find(s => s.id === count?.restaurant_id)?.name ?? store?.name ?? 'Loja';
  const here = count?.restaurant_id === currentRole?.restaurant_id;

  const setItem = (itemId: string, patch: Partial<StockCountItem>) =>
    qc.setQueryData(['stock-count', id], (old: typeof data) => old && ({ ...old, items: old.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)) }));
  const save = async (itemId: string, patch: Partial<StockCountItem>) => {
    setItem(itemId, patch);
    const { error } = await supabase.from('stock_count_items').update(patch).eq('id', itemId);
    if (error) toast.error(error.message);
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!count) return <p className="py-16 text-center text-muted-foreground">Balanço não encontrado.</p>;

  const counted = items.filter(i => i.counted_quantity != null).length;
  const divergent = items.filter(i => { const d = diffOf(i); return d != null && d !== 0; });
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 gap-1"><Link to={`${base}/stock-counts`}><ArrowLeft className="h-4 w-4" /> Balanços</Link></Button>
        <h1 className="text-2xl font-bold tracking-tight">Balanço de estoque — {storeName}</h1>
        <p className="text-sm text-muted-foreground">
          Iniciado em {count.started_at ? new Date(count.started_at).toLocaleString('pt-BR') : '—'}
          {count.closed_at ? ` · concluído em ${new Date(count.closed_at).toLocaleString('pt-BR')}` : ''}
        </p>
      </div>
      <Badge variant="outline" className={COUNT_STATUS[count.status].tone}>{COUNT_STATUS[count.status].label}</Badge>
    </div>
  );

  // ---------- relatório concluído ----------
  if (count.status === 'closed') return <Report count={count} items={items} storeName={storeName} header={header} />;

  if (count.status !== 'counting') return <div className="space-y-4">{header}<p className="text-muted-foreground">Este balanço não está em andamento.</p></div>;

  if (!here) {
    return (
      <div className="space-y-4">
        {header}
        <Card className="border-0 shadow-md"><CardContent className="space-y-3 p-6">
          <p>Esta contagem é da loja <b>{storeName}</b>. Para contar, abra essa loja.</p>
          {stores.some(s => s.id === count.restaurant_id) && (
            <Button onClick={() => switchStore(count.restaurant_id).catch(e => toast.error(e.message))}>Abrir {storeName}</Button>
          )}
        </CardContent></Card>
      </div>
    );
  }

  // ---------- revisão e relatório do responsável ----------
  if (step === 'review') {
    return <Review count={count} items={items} divergent={divergent} header={header} onBack={() => setStep('count')} save={save}
      defaultName={user?.email ?? ''} defaultRole={ROLE_LABELS[currentRole?.role ?? ''] ?? ''} canCancel={isAdminLike(currentRole?.role)}
      onDone={() => qc.invalidateQueries({ queryKey: ['stock-count', id] })} />;
  }

  // ---------- contagem ----------
  const list = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .filter(i => (filter === 'pending' ? i.counted_quantity == null : filter === 'done' ? i.counted_quantity != null : true));
  return (
    <div className="space-y-4">
      {header}
      <Card className="border-0 shadow-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <b>{counted}</b> de {items.length} contados
              {count.blind_count && <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3 w-3" /> contagem às cegas</span>}
            </div>
            <Button onClick={() => setStep('review')} disabled={counted < items.length}>
              {counted < items.length ? `Faltam ${items.length - counted}` : 'Revisar e concluir'}
            </Button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${items.length ? (counted / items.length) * 100 : 0}%` }} /></div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar item" className="pl-8" />
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {([['all', 'Todos'], ['pending', 'Faltam'], ['done', 'Contados']] as const).map(([k, l]) => (
                <Button key={k} size="sm" className="h-8" variant={filter === k ? 'default' : 'ghost'} onClick={() => setFilter(k)}>{l}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {list.map(i => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.name}</p>
              {!count.blind_count && <p className="text-xs text-muted-foreground">No sistema: {qty(i.system_quantity, i.unit)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Input
                key={`${i.id}-${i.counted_quantity}`}
                defaultValue={fmt(i.counted_quantity)}
                inputMode="decimal" placeholder="Contado" className="w-28 text-right"
                onBlur={e => { const v = parseQty(e.target.value); if (v !== i.counted_quantity) save(i.id, { counted_quantity: v }); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <span className="w-10 text-sm text-muted-foreground">{i.unit ?? ''}</span>
              {i.counted_quantity != null ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <span className="h-5 w-5" />}
            </div>
          </div>
        ))}
        {!list.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item.</p>}
      </div>
    </div>
  );
}

function Review({ count, items, divergent, header, onBack, save, defaultName, defaultRole, canCancel, onDone }: {
  count: StockCount; items: StockCountItem[]; divergent: StockCountItem[]; header: React.ReactNode; onBack: () => void;
  save: (id: string, patch: Partial<StockCountItem>) => Promise<void>; defaultName: string; defaultRole: string; canCancel: boolean; onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState(defaultRole);
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState('');
  const [adjust, setAdjust] = useState(true);
  const [busy, setBusy] = useState(false);
  const vsys = items.reduce((s, i) => s + Number(i.system_quantity) * Number(i.cost_per_unit), 0);
  const vcnt = items.reduce((s, i) => s + Number(i.counted_quantity ?? 0) * Number(i.cost_per_unit), 0);
  const missing = divergent.filter(i => !i.reason || (i.justification ?? '').trim().length < 3).length;

  const close = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('close_stock_count', {
      _count_id: count.id, _responsible_name: name, _responsible_role: role, _general_notes: notes, _signature: signature, _adjust: adjust,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Balanço concluído');
    onDone();
  };
  const cancel = async () => {
    if (!confirm('Cancelar este balanço? A contagem feita até aqui fica registrada como cancelada.')) return;
    const { error } = await supabase.rpc('cancel_stock_count', { _count_id: count.id });
    if (error) toast.error(error.message); else onDone();
  };

  return (
    <div className="space-y-4">
      {header}
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini title="Itens contados" value={String(items.length)} />
        <Mini title="Com diferença" value={String(divergent.length)} />
        <Mini title="Valor no sistema / contado" value={`${brl(vsys)} / ${brl(vcnt)}`} />
        <Mini title="Diferença" value={brl(vcnt - vsys)} tone={vcnt - vsys < 0 ? 'text-red-500' : vcnt - vsys > 0 ? 'text-emerald-500' : ''} />
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-500" /> Diferenças</CardTitle>
          <CardDescription>Para cada item com diferença, informe o motivo e explique o que aconteceu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {divergent.length ? divergent.map(i => {
            const d = diffOf(i)!;
            return (
              <div key={i.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-sm">
                    sistema {qty(i.system_quantity, i.unit)} · contado {qty(i.counted_quantity, i.unit)} ·{' '}
                    <b className={d < 0 ? 'text-red-500' : 'text-emerald-500'}>{d > 0 ? '+' : ''}{qty(d, i.unit)} ({brl(d * Number(i.cost_per_unit))})</b>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={i.reason ?? undefined} onValueChange={v => save(i.id, { reason: v as StockReason })}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Motivo" /></SelectTrigger>
                    <SelectContent>{Object.entries(STOCK_REASONS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input defaultValue={i.justification ?? ''} placeholder="Justificativa (o que aconteceu)" className="min-w-[220px] flex-1"
                    onBlur={e => { if (e.target.value !== (i.justification ?? '')) save(i.id, { justification: e.target.value }); }} />
                </div>
              </div>
            );
          }) : <p className="flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Nenhuma diferença: o estoque contado bate com o sistema.</p>}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Relatório do responsável</CardTitle>
          <CardDescription>Preenchido por quem respondeu pela operação do balanço.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Responsável *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" /></div>
            <div className="space-y-1.5"><Label>Cargo</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder="Ex.: Gerente" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações gerais</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Condições do estoque, itens que precisam de atenção, providências tomadas..." />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={adjust} onCheckedChange={v => setAdjust(v === true)} className="mt-0.5" />
            <span className="text-sm"><span className="font-medium">Ajustar o estoque do sistema para o que foi contado</span>
              <span className="block text-xs text-muted-foreground">As diferenças viram movimentações de estoque "Ajuste de balanço".</span></span>
          </label>
          <div className="space-y-1.5">
            <Label>Assinatura *</Label>
            <Input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Digite seu nome completo para assinar" />
          </div>
          {missing > 0 && <p className="text-sm text-amber-500">Falta o motivo/justificativa de {missing} item(ns).</p>}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar à contagem</Button>
              {canCancel && <Button variant="ghost" className="text-destructive" onClick={cancel}><XCircle className="mr-1 h-4 w-4" /> Cancelar balanço</Button>}
            </div>
            <Button onClick={close} disabled={busy || missing > 0 || name.trim().length < 3 || signature.trim().length < 3}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Concluir balanço
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Report({ count, items, storeName, header }: { count: StockCount; items: StockCountItem[]; storeName: string; header: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {header}
      <div className="flex flex-wrap gap-2">
        <Button onClick={async () => { setBusy(true); try { await downloadStockCountPdf(storeName, count, items); } finally { setBusy(false); } }} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF
        </Button>
        <Button variant="outline" onClick={() => downloadStockCountCsv(storeName, count, items)} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Baixar planilha</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini title="Itens contados" value={String(count.items_total)} />
        <Mini title="Com diferença" value={String(count.items_divergent)} />
        <Mini title="Valor no sistema / contado" value={`${brl(Number(count.value_system))} / ${brl(Number(count.value_counted))}`} />
        <Mini title="Diferença" value={brl(Number(count.value_difference))} tone={Number(count.value_difference) < 0 ? 'text-red-500' : Number(count.value_difference) > 0 ? 'text-emerald-500' : ''} />
      </div>
      <Card className="border-0 shadow-md">
        <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Responsável:</span> {count.responsible_name}{count.responsible_role ? ` — ${count.responsible_role}` : ''}</p>
          <p><span className="text-muted-foreground">Estoque do sistema:</span> {count.stock_adjusted ? 'ajustado para o contado' : 'não ajustado'}</p>
          <p className="sm:col-span-2"><span className="text-muted-foreground">Observações:</span> {count.general_notes || '—'}</p>
          <p className="sm:col-span-2"><span className="text-muted-foreground">Assinatura:</span> <i>{count.signature}</i></p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-md">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead><TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead><TableHead className="text-right">R$</TableHead><TableHead>Motivo / justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(i => {
                const d = diffOf(i) ?? 0;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-right">{qty(i.system_quantity, i.unit)}</TableCell>
                    <TableCell className="text-right">{qty(i.counted_quantity, i.unit)}</TableCell>
                    <TableCell className={`text-right font-medium ${d < 0 ? 'text-red-500' : d > 0 ? 'text-emerald-500' : ''}`}>{d ? `${d > 0 ? '+' : ''}${qty(d)}` : '—'}</TableCell>
                    <TableCell className="text-right">{d ? brl(d * Number(i.cost_per_unit)) : '—'}</TableCell>
                    <TableCell className="text-sm">{i.reason ? <><b>{STOCK_REASONS[i.reason]}</b>{i.justification ? ` — ${i.justification}` : ''}</> : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ title, value, tone = '' }: { title: string; value: string; tone?: string }) {
  return (
    <Card className="border-0 shadow-md"><CardContent className="space-y-1 p-4">
      <p className="text-xs text-muted-foreground">{title}</p><p className={`text-lg font-bold ${tone}`}>{value}</p>
    </CardContent></Card>
  );
}
