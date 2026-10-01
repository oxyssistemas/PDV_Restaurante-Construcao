import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, MonitorSmartphone, Pencil, Plus, Printer as PrinterIcon, RotateCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PrintAgentPanel from '@/components/admin/PrintAgentPanel';
import CloudPrinterLink from '@/components/admin/CloudPrinterLink';
import { printerModels, type ThermalWidth } from '@/lib/printing';
import {
  CONNECTIONS, enqueueJob, JOB_PURPOSES, PRINTER_COLUMNS, PURPOSE_AUTO_HINT, PURPOSE_LABELS, requeueJob, STATUS_LABELS,
  type Connection, type JobPurpose, type PrintJob, type Printer,
} from '@/lib/printQueue';

type Draft = Omit<Printer, 'id' | 'restaurant_id' | 'last_seen_at'> & { id?: string };

const emptyDraft = (): Draft => ({
  name: '', connection: 'browser', purposes: ['kitchen'], auto_print: true, enabled: true, model: 'generic',
  width: '80mm', copies: 1, address: null, header_note: null, footer_note: null,
});

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
/** Agente e impressoras nuvem avisam o servidor a cada poucos segundos. */
const isOnline = (p: Printer) => !!p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 90_000;

export default function PrintersCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { branding } = useBranding();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: printers, isLoading } = useQuery({
    queryKey: ['printers-admin', restaurantId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('printers').select(PRINTER_COLUMNS).eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return (data || []) as Printer[];
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ['print-jobs-admin', restaurantId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('print_jobs')
        .select('id, restaurant_id, printer_id, purpose, document, status, attempts, claimed_by, printed_at, error, created_at')
        .eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(15);
      if (error) throw error;
      return (data || []) as unknown as PrintJob[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['printers-admin'] });
    qc.invalidateQueries({ queryKey: ['printers'] });
    qc.invalidateQueries({ queryKey: ['printer-settings'] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim()) throw new Error('Dê um nome para a impressora (ex.: Cozinha, Bar, Caixa)');
      if (!d.purposes.length) throw new Error('Escolha pelo menos um uso para a impressora');
      if (d.connection === 'agent' && !d.address?.trim()) throw new Error('Informe o endereço da impressora (IP ou nome no Windows)');
      const row = {
        restaurant_id: restaurantId, name: d.name.trim(), connection: d.connection, purposes: d.purposes,
        auto_print: d.auto_print, enabled: d.enabled, model: d.model, width: d.width, copies: d.copies,
        address: d.address?.trim() || null, header_note: d.header_note?.trim() || null, footer_note: d.footer_note?.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from('printers').update(row).eq('id', d.id)
        : await supabase.from('printers').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setDraft(null); toast.success('Impressora salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: Printer) => {
      const { error } = await supabase.from('printers').update({ enabled: !p.enabled }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('printers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success('Impressora removida'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (p: Printer) => enqueueJob(p, 'test', { kind: 'test', restaurant_name: branding?.brand_name?.trim() || 'Oxys Restaurante', printer_name: p.name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['print-jobs-admin'] }); toast.success('Teste enviado para a fila desta impressora.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprint = useMutation({
    mutationFn: requeueJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['print-jobs-admin'] }); toast.success('Enviado de novo para a fila'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const byId = Object.fromEntries((printers || []).map(p => [p.id, p]));
  const setD = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2"><PrinterIcon className="h-5 w-5" /> Impressoras</CardTitle>
          <CardDescription>Cadastre as impressoras térmicas e escolha o que cada uma imprime e o que sai sozinho.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2"><Link to="/impressao"><MonitorSmartphone className="h-4 w-4" /> Estação de impressão</Link></Button>
          <Button className="gap-2" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> Nova impressora</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : !printers?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma impressora cadastrada. Sem impressora, os cupons saem pela janela de impressão do navegador de quem clicar em imprimir.</p>
        ) : (
          <div className="space-y-2">
            {printers.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-[200px] flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {p.name}
                    <Badge variant="outline">{CONNECTIONS[p.connection].label}</Badge>
                    {p.auto_print && <Badge variant="secondary">Automática</Badge>}
                    {p.connection !== 'browser' && (
                      <Badge variant={isOnline(p) ? 'secondary' : 'destructive'}>{isOnline(p) ? 'Conectada' : 'Sem contato'}</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.purposes.map(x => PURPOSE_LABELS[x]).join(' · ')} · {p.width} · {p.copies} via(s)</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={p.enabled} onCheckedChange={() => toggle.mutate(p)} aria-label="Ativa" /> {p.enabled ? 'Ativa' : 'Desativada'}
                </div>
                {(p.connection === 'cloudprnt' || p.connection === 'epson_sdp') && <CloudPrinterLink printer={p} />}
                <Button size="sm" variant="outline" className="gap-2" disabled={test.isPending || !p.enabled} onClick={() => test.mutate(p)}><Send className="h-4 w-4" /> Testar</Button>
                <Button size="icon" variant="ghost" onClick={() => setDraft({ ...p })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Remover"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover {p.name}?</AlertDialogTitle>
                      <AlertDialogDescription>Os cupons na fila desta impressora também serão apagados.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(p.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        <PrintAgentPanel restaurantId={restaurantId} />

        {!!jobs?.length && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Últimas impressões</p>
            <div className="divide-y rounded-lg border">
              {jobs.map(j => (
                <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="w-28 text-muted-foreground">{fmt(j.created_at)}</span>
                  <span className="min-w-0 flex-1">{j.purpose === 'test' ? 'Teste' : PURPOSE_LABELS[j.purpose as JobPurpose]} · {byId[j.printer_id]?.name ?? 'Impressora removida'}</span>
                  <Badge variant={j.status === 'error' ? 'destructive' : j.status === 'done' ? 'secondary' : 'outline'}>{STATUS_LABELS[j.status]}</Badge>
                  {(j.status === 'done' || j.status === 'error') && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => reprint.mutate(j.id)}><RotateCw className="h-3.5 w-3.5" /> Reimprimir</Button>
                  )}
                  {j.error && <span className="w-full text-xs text-destructive">{j.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={o => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? 'Editar impressora' : 'Nova impressora'}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pr-name">Nome</Label>
                <Input id="pr-name" value={draft.name} placeholder="Ex.: Cozinha, Bar, Caixa" onChange={e => setD({ name: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Como ela recebe os cupons</Label>
                <Select value={draft.connection} onValueChange={v => setD({ connection: v as Connection })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CONNECTIONS) as Connection[]).map(c => (
                      <SelectItem key={c} value={c} disabled={!CONNECTIONS[c].available}>
                        {CONNECTIONS[c].label}{!CONNECTIONS[c].available && ' (em breve)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{CONNECTIONS[draft.connection].description}</p>
              </div>

              <div className="space-y-2">
                <Label>O que ela imprime</Label>
                <div className="space-y-2">
                  {JOB_PURPOSES.map(x => (
                    <label key={x} className="flex items-start gap-2 text-sm">
                      <Checkbox className="mt-0.5" checked={draft.purposes.includes(x)}
                        onCheckedChange={v => setD({ purposes: v ? [...draft.purposes, x] : draft.purposes.filter(y => y !== x) })} />
                      <span>{PURPOSE_LABELS[x]} <span className="text-muted-foreground">({PURPOSE_AUTO_HINT[x]})</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Impressão automática</span>
                  <span className="block text-xs text-muted-foreground">Sem ninguém clicar em imprimir, conforme os usos marcados acima.</span>
                </span>
                <Switch checked={draft.auto_print} onCheckedChange={v => setD({ auto_print: v })} />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Modelo</Label>
                  <Select value={draft.model} onValueChange={v => setD({ model: v, width: printerModels.find(m => m.value === v)?.width ?? draft.width })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{printerModels.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bobina</Label>
                  <Select value={draft.width} onValueChange={v => setD({ width: v as ThermalWidth })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="80mm">80 mm</SelectItem><SelectItem value="58mm">58 mm</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="pr-copies">Vias</Label>
                  <Input id="pr-copies" type="number" min={1} max={5} value={draft.copies}
                    onChange={e => setD({ copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                </div>
                {draft.connection === 'agent' && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="pr-address">Endereço</Label>
                    <Input id="pr-address" value={draft.address ?? ''} placeholder="Ex.: 192.168.0.50 ou EPSON TM-T20 (nome no Windows)" onChange={e => setD({ address: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pr-header">Texto no topo (opcional)</Label>
                <Input id="pr-header" value={draft.header_note ?? ''} onChange={e => setD({ header_note: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-footer">Texto no rodapé (opcional)</Label>
                <Input id="pr-footer" value={draft.footer_note ?? ''} onChange={e => setD({ footer_note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
