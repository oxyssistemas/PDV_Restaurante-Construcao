import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Printer as PrinterIcon, RotateCw, Send, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { printHtml } from '@/lib/printing';
import {
  enqueueJob, loadStation, PRINTER_COLUMNS, PURPOSE_LABELS, renderJob, requeueJob, saveStation, STATUS_LABELS,
  type JobPurpose, type PrintJob, type Printer,
} from '@/lib/printQueue';
import { getStationActivity, type StationActivity } from '@/components/print/PrintStationRunner';

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export default function PrintStation() {
  const { currentRole } = useAuth();
  const { branding } = useBranding();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saved, setSaved] = useState<string[]>(() => loadStation(restaurantId)?.printerIds ?? []);
  const [selected, setSelected] = useState<string[]>(saved);
  const [activity, setActivity] = useState<StationActivity>(getStationActivity);

  useEffect(() => {
    const ids = loadStation(restaurantId)?.printerIds ?? [];
    setSaved(ids);
    setSelected(ids);
  }, [restaurantId]);
  useEffect(() => {
    const on = (e: Event) => {
      setActivity((e as CustomEvent<StationActivity>).detail);
      qc.invalidateQueries({ queryKey: ['print-jobs'] });
    };
    window.addEventListener('oxys:print-activity', on);
    return () => window.removeEventListener('oxys:print-activity', on);
  }, [qc]);

  const { data: printers, isLoading } = useQuery({
    queryKey: ['printers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('printers').select(PRINTER_COLUMNS)
        .eq('restaurant_id', restaurantId!).eq('connection', 'browser').order('name');
      if (error) throw error;
      return (data || []) as Printer[];
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ['print-jobs', restaurantId, saved.join(',')],
    enabled: !!restaurantId && saved.length > 0,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('print_jobs')
        .select('id, restaurant_id, printer_id, purpose, document, status, attempts, claimed_by, printed_at, error, created_at')
        .in('printer_id', saved).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []) as unknown as PrintJob[];
    },
  });

  const byId = useMemo(() => Object.fromEntries((printers || []).map(p => [p.id, p])), [printers]);
  const dirty = selected.slice().sort().join() !== saved.slice().sort().join();

  const save = () => {
    saveStation(restaurantId!, selected);
    setSaved(selected);
    qc.invalidateQueries({ queryKey: ['print-jobs'] });
    toast.success(selected.length ? 'Este computador agora imprime as impressoras marcadas' : 'Estação desligada neste computador');
  };

  const test = useMutation({
    mutationFn: (p: Printer) => enqueueJob(p, 'test', { kind: 'test', restaurant_name: branding?.brand_name?.trim() || 'Oxys Restaurante', printer_name: p.name }),
    onSuccess: () => toast.success('Teste enviado para a fila'),
    onError: (e: Error) => toast.error(e.message),
  });

  const reprint = useMutation({
    mutationFn: requeueJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['print-jobs'] }); toast.success('Enviado de novo para a fila'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Imprime aqui mesmo um trabalho que ficou parado (ex.: mais de 1 hora na fila).
  const printHere = async (job: PrintJob) => {
    const p = byId[job.printer_id];
    if (!p) return;
    await printHtml(renderJob(job.document, p));
    await supabase.from('print_jobs').update({ status: 'done', printed_at: new Date().toISOString(), error: null }).eq('id', job.id);
    qc.invalidateQueries({ queryKey: ['print-jobs'] });
  };

  if (!restaurantId) return <p className="p-6 text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Estação de impressão</h1>
          <p className="text-muted-foreground">Deixe esta tela (ou qualquer tela do sistema) aberta no computador ligado à impressora.</p>
        </div>
        {saved.length > 0 && (
          <Badge variant={activity.online ? 'secondary' : 'destructive'} className="gap-1.5">
            {activity.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {activity.online ? (activity.printing ? 'Imprimindo...' : 'Conectada') : 'Desconectada'}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Impressoras deste computador</CardTitle>
          <CardDescription>Marque as impressoras que estão instaladas neste computador. Os cupons delas vão sair aqui.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : !printers?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma impressora do tipo "Estação no navegador" cadastrada. O administrador cadastra em Configurações → Impressoras.</p>
          ) : printers.map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Checkbox id={`pr-${p.id}`} checked={selected.includes(p.id)}
                onCheckedChange={v => setSelected(s => (v ? [...s, p.id] : s.filter(x => x !== p.id)))} />
              <label htmlFor={`pr-${p.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex items-center gap-2 font-medium"><PrinterIcon className="h-4 w-4" /> {p.name} {!p.enabled && <Badge variant="outline">Desativada</Badge>}</span>
                <span className="block text-xs text-muted-foreground">{p.purposes.map(x => PURPOSE_LABELS[x as JobPurpose]).join(' · ')} · {p.width}</span>
              </label>
              <Button size="sm" variant="outline" className="gap-2" disabled={test.isPending} onClick={() => test.mutate(p)}>
                <Send className="h-4 w-4" /> Testar
              </Button>
            </div>
          ))}
          {!!printers?.length && (
            <Button onClick={save} disabled={!dirty}>Salvar neste computador</Button>
          )}
          {activity.lastError && <p className="text-sm text-destructive">Último erro: {activity.lastError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Imprimir sem abrir a janela de impressão</CardTitle>
          <CardDescription>
            Por segurança, o navegador sempre pergunta antes de imprimir. Para os cupons saírem sozinhos, abra o sistema por um
            atalho do Google Chrome com a impressão silenciosa ligada. Os cupons vão para a <strong>impressora padrão</strong> do computador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="windows">
            <TabsList>
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
              <TabsTrigger value="mac">Mac</TabsTrigger>
              <TabsTrigger value="mobile">Tablet / celular</TabsTrigger>
            </TabsList>
            <TabsContent value="windows" className="space-y-2 text-sm text-muted-foreground">
              <p>1. Em Configurações do Windows → Impressoras, defina a térmica como <strong>padrão</strong> e desligue "Permitir que o Windows gerencie minha impressora padrão".</p>
              <p>2. Clique com o botão direito na área de trabalho → Novo → Atalho, e cole:</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://www.oxysrestaurante.app/login</pre>
              <p>3. Feche todas as janelas do Chrome e abra sempre por esse atalho. Entre no sistema e marque as impressoras acima.</p>
            </TabsContent>
            <TabsContent value="linux" className="space-y-2 text-sm text-muted-foreground">
              <p>1. Defina a térmica como impressora padrão nas configurações do sistema.</p>
              <p>2. Feche o Chrome e abra com:</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">google-chrome --kiosk-printing https://www.oxysrestaurante.app/login</pre>
            </TabsContent>
            <TabsContent value="mac" className="space-y-2 text-sm text-muted-foreground">
              <p>1. Em Ajustes do Sistema → Impressoras, defina a térmica como padrão.</p>
              <p>2. Feche o Chrome e, no Terminal, rode:</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">open -a "Google Chrome" --args --kiosk-printing https://www.oxysrestaurante.app/login</pre>
            </TabsContent>
            <TabsContent value="mobile" className="space-y-2 text-sm text-muted-foreground">
              <p>Tablets e celulares não deixam o navegador imprimir sem confirmação. Neles a estação abre a janela de impressão a cada cupom (um toque para confirmar).</p>
              <p>Para impressão totalmente automática sem computador, use o agente local em qualquer PC do restaurante ou uma impressora com Star CloudPRNT / Epson Server Direct Print.</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {saved.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Últimos cupons desta estação</CardTitle></CardHeader>
          <CardContent>
            {!jobs?.length ? <p className="text-sm text-muted-foreground">Nenhum cupom ainda.</p> : (
              <div className="divide-y">
                {jobs.map(j => {
                  const stale = j.status === 'queued' && Date.now() - new Date(j.created_at).getTime() > 60 * 60_000;
                  const doc = j.document as { order?: { table_number?: number | null; customer_name?: string | null } };
                  return (
                    <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                      <span className="w-36 text-muted-foreground">{fmt(j.created_at)}</span>
                      <span className="min-w-0 flex-1">
                        {j.purpose === 'test' ? 'Teste' : PURPOSE_LABELS[j.purpose as JobPurpose]}
                        {doc.order?.table_number != null && ` · Mesa ${doc.order.table_number}`}
                        {doc.order?.customer_name && ` · ${doc.order.customer_name}`}
                        <span className="text-muted-foreground"> · {byId[j.printer_id]?.name}</span>
                      </span>
                      <Badge variant={j.status === 'error' ? 'destructive' : j.status === 'done' ? 'secondary' : 'outline'}>
                        {stale ? 'Parado' : STATUS_LABELS[j.status]}
                      </Badge>
                      {stale ? (
                        <Button size="sm" variant="outline" onClick={() => printHere(j)}>Imprimir agora</Button>
                      ) : (j.status === 'done' || j.status === 'error') && (
                        <Button size="sm" variant="ghost" className="gap-1" disabled={reprint.isPending} onClick={() => reprint.mutate(j.id)}>
                          <RotateCw className="h-3.5 w-3.5" /> Reimprimir
                        </Button>
                      )}
                      {j.error && <span className="w-full text-xs text-destructive">{j.error}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
