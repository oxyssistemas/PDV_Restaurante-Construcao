import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, MessageCircle, Plus, Send, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { edgeErrorMessage } from '@/lib/functionError';
import { waLink } from '@/lib/deliveryStore';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import type { Tables } from '@/integrations/supabase/types';

type Campaign = Tables<'whatsapp_campaigns'>;
type Seg = { inactive_days: string; active_days: string; min_orders: string; min_spent: string; birthday_month: boolean; channel: 'all' | 'delivery' | 'salon' };
type Person = { phone: string; name: string | null; orders: number; spent: number; last_order: string | null };
const emptySeg: Seg = { inactive_days: '', active_days: '', min_orders: '', min_spent: '', birthday_month: false, channel: 'all' };
const PRESETS: { label: string; seg: Partial<Seg> }[] = [
  { label: 'Sumidos há 30 dias', seg: { inactive_days: '30' } },
  { label: 'Clientes fiéis (5+ pedidos)', seg: { min_orders: '5' } },
  { label: 'Quem mais gasta (R$ 300+)', seg: { min_spent: '300' } },
  { label: 'Aniversariantes do mês', seg: { birthday_month: true } },
  { label: 'Pediram nos últimos 7 dias', seg: { active_days: '7' } },
];
const segPayload = (s: Seg) => ({ ...s, inactive_days: s.inactive_days || null, active_days: s.active_days || null, min_orders: s.min_orders || null, min_spent: s.min_spent || null });
const fill = (msg: string, name: string | null) => msg.replace(/\{nome\}/gi, String(name ?? '').trim().split(/\s+/)[0] || 'tudo bem');

/** Marketing → WhatsApp: campanhas por segmento (só quem aceitou receber ofertas). */
export default function WhatsAppCampaigns() {
  const { currentRole, user } = useAuth();
  const rid = currentRole?.restaurant_id ?? '';
  const qc = useQueryClient();
  const { canEdit } = useModuleAccess();
  const editable = canEdit('marketing');
  const [form, setForm] = useState<{ name: string; mode: 'assisted' | 'template'; message: string; template_name: string; seg: Seg } | null>(null);
  const [open, setOpen] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['wa-campaigns', rid],
    enabled: !!rid,
    queryFn: async () => (await supabase.from('whatsapp_campaigns').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false })).data ?? [],
  });

  const { data: audience, isFetching } = useQuery({
    queryKey: ['wa-audience', rid, form?.seg],
    enabled: !!rid && !!form,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('campaign_audience', { _restaurant_id: rid, _seg: segPayload(form!.seg) });
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (form.name.trim().length < 2) throw new Error('Dê um nome à campanha.');
      if (form.mode === 'assisted' && form.message.trim().length < 5) throw new Error('Escreva a mensagem.');
      if (form.mode === 'template' && !/^[a-z0-9_]{2,}$/.test(form.template_name)) throw new Error('Informe o nome do modelo aprovado na Meta (minúsculas e _).');
      if (!audience?.length) throw new Error('Nenhum cliente nesse público.');
      const { data: c, error } = await supabase.from('whatsapp_campaigns').insert({
        restaurant_id: rid, name: form.name.trim(), mode: form.mode, message: form.message.trim() || null, template_name: form.template_name || null,
        segment: segPayload(form.seg), total: audience.length, created_by: user?.id ?? null,
      }).select('*').single();
      if (error) throw error;
      for (let i = 0; i < audience.length; i += 500) {
        const { error: e2 } = await supabase.from('whatsapp_campaign_recipients').insert(
          audience.slice(i, i + 500).map(p => ({ campaign_id: c.id, restaurant_id: rid, phone: p.phone, name: p.name })),
        );
        if (e2) throw e2;
      }
      return c;
    },
    onSuccess: c => { qc.invalidateQueries({ queryKey: ['wa-campaigns', rid] }); setForm(null); if (c) setOpen(c); toast.success('Campanha criada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (c: Campaign) => { const { error } = await supabase.from('whatsapp_campaigns').delete().eq('id', c.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-campaigns', rid] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campanhas de WhatsApp</h1>
          <p className="text-muted-foreground">Mande ofertas para um público escolhido. Só entram clientes do CRM marcados como "aceita receber ofertas" (LGPD).</p>
        </div>
        {editable && <Button className="gap-2" onClick={() => setForm({ name: '', mode: 'assisted', message: 'Oi, {nome}! Saudade de você por aqui 😊 Hoje tem 10% de desconto no seu pedido. Peça pelo link: ', template_name: '', seg: { ...emptySeg } })}><Plus className="h-4 w-4" /> Nova campanha</Button>}
      </div>

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : !campaigns?.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma campanha ainda.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map(c => (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-semibold">{c.name}</span>
                  <Badge variant="outline">{c.mode === 'template' ? 'Automático' : 'Assistido'}</Badge>
                  <Badge>{{ draft: 'Pronta', sending: 'Enviando', done: 'Concluída' }[c.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{c.total} cliente(s) · {c.sent} enviada(s){c.failed ? ` · ${c.failed} falha(s)` : ''} · {new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1" onClick={() => setOpen(c)}><Send className="h-3.5 w-3.5" /> Abrir</Button>
                  {editable && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="cp-name">Nome</Label><Input id="cp-name" maxLength={80} placeholder="Ex.: Volta pra gente — outubro" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Público</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => <Button key={p.label} type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, seg: { ...emptySeg, ...p.seg } })}>{p.label}</Button>)}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label className="text-xs">Sem pedir há (dias)</Label><Input type="number" min={1} value={form.seg.inactive_days} onChange={e => setForm({ ...form, seg: { ...form.seg, inactive_days: e.target.value } })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Pediu nos últimos (dias)</Label><Input type="number" min={1} value={form.seg.active_days} onChange={e => setForm({ ...form, seg: { ...form.seg, active_days: e.target.value } })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Mínimo de pedidos</Label><Input type="number" min={1} value={form.seg.min_orders} onChange={e => setForm({ ...form, seg: { ...form.seg, min_orders: e.target.value } })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Gastou pelo menos (R$)</Label><Input type="number" min={0} value={form.seg.min_spent} onChange={e => setForm({ ...form, seg: { ...form.seg, min_spent: e.target.value } })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Canal</Label>
                    <Select value={form.seg.channel} onValueChange={(v: Seg['channel']) => setForm({ ...form, seg: { ...form.seg, channel: v } })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="delivery">Delivery e retirada</SelectItem><SelectItem value="salon">Salão</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={form.seg.birthday_month} onCheckedChange={v => setForm({ ...form, seg: { ...form.seg, birthday_month: v } })} /> Aniversariantes do mês</label>
                </div>
                <p className="flex items-center gap-1 text-sm"><Users className="h-4 w-4" /> {isFetching ? 'calculando…' : `${audience?.length ?? 0} cliente(s) neste público`}</p>
              </div>
              <div className="space-y-2">
                <Label>Como enviar</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([['assisted', 'Assistido (sem API)', 'O sistema abre cada conversa no seu WhatsApp com a mensagem pronta; você só aperta enviar.'],
                    ['template', 'Automático (WhatsApp oficial)', 'Envia sozinho com um modelo aprovado pela Meta. Precisa do WhatsApp Business conectado.']] as const).map(([k, l, d]) => (
                    <button key={k} type="button" aria-pressed={form.mode === k} onClick={() => setForm({ ...form, mode: k })}
                      className={`rounded-xl border p-3 text-left text-sm ${form.mode === k ? 'border-primary bg-primary/10' : 'hover:border-primary/40'}`}>
                      <b>{l}</b><p className="text-xs text-muted-foreground">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
              {form.mode === 'assisted' ? (
                <div className="space-y-1.5"><Label htmlFor="cp-msg">Mensagem ({'{nome}'} vira o primeiro nome)</Label>
                  <Textarea id="cp-msg" rows={4} maxLength={1000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></div>
              ) : (
                <div className="space-y-1.5"><Label htmlFor="cp-tpl">Nome do modelo aprovado na Meta</Label>
                  <Input id="cp-tpl" placeholder="ex.: oferta_volta_cliente" value={form.template_name} onChange={e => setForm({ ...form, template_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
                  <p className="text-xs text-muted-foreground">O modelo deve ter uma variável {'{{1}}'} para o primeiro nome do cliente. Crie e aprove no Gerenciador do WhatsApp da Meta.</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={create.isPending || !audience?.length} onClick={() => create.mutate()}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar campanha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {open && <CampaignRun campaign={open} restaurantId={rid} editable={editable} onClose={() => { setOpen(null); qc.invalidateQueries({ queryKey: ['wa-campaigns', rid] }); }} />}
    </div>
  );
}

function CampaignRun({ campaign, restaurantId, editable, onClose }: { campaign: Campaign; restaurantId: string; editable: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const { data: people } = useQuery({
    queryKey: ['wa-recipients', campaign.id],
    queryFn: async () => (await supabase.from('whatsapp_campaign_recipients').select('*').eq('campaign_id', campaign.id).order('name')).data ?? [],
  });
  const mark = async (id: string) => {
    await supabase.from('whatsapp_campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    const sent = (people ?? []).filter(p => p.status === 'sent').length + 1;
    await supabase.from('whatsapp_campaigns').update({ sent, status: sent >= campaign.total ? 'done' : 'sending' }).eq('id', campaign.id);
    qc.invalidateQueries({ queryKey: ['wa-recipients', campaign.id] });
  };
  const runAuto = async () => {
    setRunning(true);
    try {
      for (let guard = 0; guard < 200; guard++) {
        const { data, error } = await supabase.functions.invoke('whatsapp-campaign', { body: { restaurantId, campaignId: campaign.id } });
        const msg = error ? await edgeErrorMessage(error) : (data as { error?: string })?.error;
        if (msg) throw new Error(msg);
        qc.invalidateQueries({ queryKey: ['wa-recipients', campaign.id] });
        if (!(data as { left: number }).left) break;
      }
      toast.success('Campanha enviada');
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };
  const pending = (people ?? []).filter(p => p.status === 'pending');
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{campaign.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{(people ?? []).length - pending.length} de {(people ?? []).length} enviada(s)</p>
        {campaign.mode === 'template' ? (
          editable && <Button className="gap-2" disabled={running || !pending.length} onClick={runAuto}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {pending.length ? `Enviar para ${pending.length}` : 'Tudo enviado'}</Button>
        ) : (
          <p className="text-xs text-muted-foreground">Toque em cada cliente: o WhatsApp abre com a mensagem pronta. Depois de enviar, ele fica marcado.</p>
        )}
        <ul className="space-y-1">
          {(people ?? []).map(p => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name || p.phone}</span>
              {p.status === 'sent' ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" aria-label="Enviada" />
                : p.status === 'failed' ? <Badge variant="destructive" title={p.error ?? ''}>falhou</Badge>
                : campaign.mode === 'assisted' && editable ? (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { window.open(waLink(p.phone, fill(campaign.message ?? '', p.name)), '_blank', 'noopener'); mark(p.id); }}>
                    <MessageCircle className="h-3.5 w-3.5" /> Enviar
                  </Button>
                ) : <Badge variant="outline">pendente</Badge>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

