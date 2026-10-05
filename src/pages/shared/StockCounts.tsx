import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ClipboardCheck, Download, FileSpreadsheet, Loader2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStore } from '@/hooks/useCurrentStore';
import { isAdminLike } from '@/lib/roles';
import { brl } from '@/lib/finance';
import {
  COUNT_STATUS, FREQUENCIES, WEEKDAYS, downloadStockCountCsv, downloadStockCountPdf, type StockCount, type StockCountItem,
} from '@/lib/stockCount';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

type Settings = { frequency: keyof typeof FREQUENCIES; weekday: number; month_day: number; blind_count: boolean; next_due_date: string | null };
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—');

/** Balanço de estoque: agenda, balanço em andamento e histórico (desta loja ou de toda a rede). */
export default function StockCountsPage() {
  const { currentRole, stores } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const base = pathname.startsWith('/finance') ? '/finance' : '/admin';
  const qc = useQueryClient();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const canManage = isAdminLike(currentRole?.role);
  const [scope, setScope] = useState<'store' | 'network'>('store');
  const [starting, setStarting] = useState(false);
  const { store } = useCurrentStore();
  const storeName = (id: string) => stores.find(s => s.id === id)?.name ?? (id === store?.id ? store.name : 'Loja');

  const { data: counts, isLoading } = useQuery({
    queryKey: ['stock-counts', scope, restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      let q = supabase.from('stock_counts').select('*').order('created_at', { ascending: false }).limit(100);
      if (scope === 'store') q = q.eq('restaurant_id', restaurantId!);
      else q = q.in('restaurant_id', stores.map(s => s.id));
      const { data, error } = await q;
      if (error) throw error;
      return data as StockCount[];
    },
  });
  const open = counts?.find(c => c.restaurant_id === restaurantId && (c.status === 'counting' || c.status === 'scheduled'));

  const start = async (countId?: string) => {
    setStarting(true);
    try {
      const { data, error } = await supabase.rpc('start_stock_count', countId ? { _count_id: countId } : {});
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
      navigate(`${base}/stock-counts/${data}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível iniciar'); }
    finally { setStarting(false); }
  };

  const download = async (c: StockCount, kind: 'pdf' | 'csv') => {
    const { data: items, error } = await supabase.from('stock_count_items').select('*').eq('count_id', c.id).order('name');
    if (error) { toast.error(error.message); return; }
    const name = storeName(c.restaurant_id);
    if (kind === 'pdf') await downloadStockCountPdf(name, c, items as StockCountItem[]);
    else downloadStockCountCsv(name, c, items as StockCountItem[]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><ClipboardCheck className="h-7 w-7 text-primary" /> Balanço de estoque</h1>
          <p className="text-muted-foreground">Contagem física comparada com o estoque do sistema, com relatório do responsável.</p>
        </div>
        {stores.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <Button size="sm" className="h-8" variant={scope === 'store' ? 'default' : 'ghost'} onClick={() => setScope('store')}>Esta loja</Button>
            <Button size="sm" className="h-8" variant={scope === 'network' ? 'default' : 'ghost'} onClick={() => setScope('network')}>Toda a rede</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Balanço desta loja</CardTitle>
            <CardDescription>
              {open?.status === 'counting' ? 'Há uma contagem em andamento.' : open?.status === 'scheduled' ? `Balanço agendado para ${day(open.due_date)}.` : 'Nenhum balanço em andamento.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {open?.status === 'counting' ? (
              <Button asChild className="gap-2"><Link to={`${base}/stock-counts/${open.id}`}><Play className="h-4 w-4" /> Continuar contagem</Link></Button>
            ) : (
              <Button onClick={() => start(open?.id)} disabled={starting} className="gap-2">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {open?.status === 'scheduled' ? 'Iniciar o balanço agendado' : 'Iniciar balanço agora'}
              </Button>
            )}
          </CardContent>
        </Card>
        {canManage && restaurantId && <ScheduleCard restaurantId={restaurantId} />}
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle className="text-lg">Histórico</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  {scope === 'network' && <TableHead>Loja</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Com diferença</TableHead>
                  <TableHead className="text-right">Diferença (R$)</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(counts ?? []).map(c => (
                  <TableRow key={c.id}>
                    {scope === 'network' && <TableCell className="font-medium">{storeName(c.restaurant_id)}</TableCell>}
                    <TableCell>
                      {new Date(c.closed_at ?? c.started_at ?? `${c.due_date}T12:00:00`).toLocaleDateString('pt-BR')}
                      {c.kind === 'scheduled' && <span className="ml-1 text-xs text-muted-foreground">(agendado)</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={COUNT_STATUS[c.status].tone}>{COUNT_STATUS[c.status].label}</Badge></TableCell>
                    <TableCell className="text-right">{c.items_total}</TableCell>
                    <TableCell className="text-right">{c.status === 'closed' ? c.items_divergent : '—'}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(c.value_difference) < 0 ? 'text-red-500' : Number(c.value_difference) > 0 ? 'text-emerald-500' : ''}`}>
                      {c.status === 'closed' ? brl(Number(c.value_difference)) : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{c.responsible_name ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {c.status !== 'cancelled' && c.status !== 'scheduled' && (
                        <Button asChild size="sm" variant="ghost"><Link to={`${base}/stock-counts/${c.id}`}>{c.status === 'closed' ? 'Relatório' : 'Abrir'}</Link></Button>
                      )}
                      {c.status === 'closed' && (
                        <>
                          <Button size="icon" variant="ghost" title="Baixar PDF" onClick={() => download(c, 'pdf')}><Download className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Baixar planilha" onClick={() => download(c, 'csv')}><FileSpreadsheet className="h-4 w-4" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!counts?.length && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum balanço ainda.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Agenda do balanço desta loja. */
function ScheduleCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>({ frequency: 'none', weekday: 1, month_day: 1, blind_count: true, next_due_date: null });
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ['stock-count-settings', restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from('stock_count_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle();
      return data as Settings | null;
    },
  });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('stock_count_settings').upsert({
      restaurant_id: restaurantId, frequency: form.frequency, weekday: form.weekday, month_day: form.month_day, blind_count: form.blind_count,
    }, { onConflict: 'restaurant_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Agenda salva');
    qc.invalidateQueries({ queryKey: ['stock-count-settings'] });
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5" /> Agenda</CardTitle>
        <CardDescription>
          No dia, o balanço é criado sozinho e os responsáveis são avisados.{data?.next_due_date ? ` Próximo: ${day(data.next_due_date)}.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v as Settings['frequency'] })}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(FREQUENCIES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          {(form.frequency === 'weekly' || form.frequency === 'biweekly') && (
            <Select value={String(form.weekday)} onValueChange={v => setForm({ ...form, weekday: Number(v) })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKDAYS.map((w, i) => <SelectItem key={w} value={String(i)}>{w}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {form.frequency === 'monthly' && (
            <Select value={String(form.month_day)} onValueChange={v => setForm({ ...form, month_day: Number(v) })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="blind" checked={form.blind_count} onCheckedChange={v => setForm({ ...form, blind_count: v })} />
          <Label htmlFor="blind" className="text-sm font-normal">Contagem às cegas (quem conta não vê o número do sistema)</Label>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar agenda</Button>
      </CardContent>
    </Card>
  );
}
