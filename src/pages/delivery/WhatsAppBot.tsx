import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Hand, Loader2, MessageCircle, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { callBot } from '@/lib/deliveryStore';

type Settings = { enabled: boolean; greeting: string; closed_message: string; notify_status: boolean; human_pause_minutes: number };
const DEFAULTS: Settings = {
  enabled: false,
  greeting: 'Olá! 👋 Seja bem-vindo(a) ao {restaurante}.',
  closed_message: 'No momento estamos fechados. Assim que abrirmos, é só pedir pelo link!',
  notify_status: true,
  human_pause_minutes: 60,
};

const phoneLabel = (p: string) => {
  const d = p.replace(/\D/g, '').replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p;
};
const botPaused = (until: string | null) => !!until && new Date(until).getTime() > Date.now();

export default function WhatsAppBot() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const qc = useQueryClient();

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['wa-overview', restaurantId],
    enabled: !!restaurantId,
    queryFn: () => callBot<{ metaConnected: boolean; accounts: { id: string; name: string; selected: boolean }[] }>({ action: 'overview', restaurantId }),
  });
  const selected = overview?.accounts.find(a => a.selected);

  const { data: saved } = useQuery({
    queryKey: ['wa-bot', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_bot_settings').select('*').eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (saved !== undefined && !form) setForm(saved ? { ...DEFAULTS, ...saved } : DEFAULTS); }, [saved, form]);

  const selectAccount = useMutation({
    mutationFn: (accountId: string) => callBot({ action: 'select_account', restaurantId, accountId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-overview', restaurantId] }); toast.success('Número escolhido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (f: Settings) => {
      if (f.enabled && !selected) throw new Error('Escolha o número do WhatsApp antes de ligar o robô.');
      const { error } = await supabase.from('whatsapp_bot_settings').upsert({
        restaurant_id: restaurantId!, enabled: f.enabled, greeting: f.greeting.trim() || DEFAULTS.greeting,
        closed_message: f.closed_message.trim() || DEFAULTS.closed_message, notify_status: f.notify_status,
        human_pause_minutes: Math.min(1440, Math.max(5, Math.round(f.human_pause_minutes) || 60)),
      }, { onConflict: 'restaurant_id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-bot', restaurantId] }); toast.success('Robô salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form || loadingOverview) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><MessageCircle className="h-6 w-6 text-[#25d366]" /> WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Robô que atende, manda o link da loja, avisa o status do pedido e chama um atendente quando o cliente pede.</p>
      </div>

      <Tabs defaultValue="conversas">
        <TabsList>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="robo">Robô e número</TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="mt-4">
          {selected ? <Inbox restaurantId={restaurantId!} /> : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Conecte o número do WhatsApp na aba "Robô e número" para ver as conversas aqui.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="robo" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Número do WhatsApp</CardTitle>
              <CardDescription>Use um número do WhatsApp Business ligado à conta Meta (Facebook) do restaurante.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!overview?.metaConnected ? (
                <div className="space-y-2">
                  <p>1. Um administrador conecta a conta Meta do restaurante em <strong>Marketing → Conexões</strong> (a mesma do Instagram e Facebook).</p>
                  <p>2. Volte aqui e escolha o número.</p>
                  {currentRole?.role === 'admin' && <Button asChild size="sm" variant="outline"><Link to="/marketing/connections">Abrir Conexões</Link></Button>}
                </div>
              ) : !overview.accounts.length ? (
                <p>A conta Meta conectada não tem número de WhatsApp Business. Cadastre o número no Gerenciador do WhatsApp da Meta e conecte de novo em Marketing → Conexões.</p>
              ) : (
                <Select value={selected?.id} onValueChange={v => selectAccount.mutate(v)}>
                  <SelectTrigger className="max-w-md"><SelectValue placeholder="Escolha o número" /></SelectTrigger>
                  <SelectContent>{overview.accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> Robô de atendimento</CardTitle>
              <CardDescription>
                Menu: 1 · fazer pedido (link da loja online) · 2 · acompanhar pedido · 3 · horário e endereço · 4 · falar com atendente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="text-sm font-medium">Robô ligado</span>
                <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span><span className="block text-sm font-medium">Avisar o status do pedido</span>
                  <span className="text-xs text-muted-foreground">Recebido, em preparo, saiu para entrega e entregue. A Meta só permite para quem mandou mensagem nas últimas 24 h.</span></span>
                <Switch checked={form.notify_status} onCheckedChange={v => setForm({ ...form, notify_status: v })} />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="wa-greet">Saudação</Label>
                <Textarea id="wa-greet" rows={2} maxLength={500} value={form.greeting} onChange={e => setForm({ ...form, greeting: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">{'{restaurante}'} vira o nome do restaurante.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-closed">Mensagem com a loja fechada</Label>
                <Textarea id="wa-closed" rows={2} maxLength={500} value={form.closed_message} onChange={e => setForm({ ...form, closed_message: e.target.value })} />
              </div>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="wa-pause">Robô pausa quando o atendente assume (min)</Label>
                <Input id="wa-pause" inputMode="numeric" value={form.human_pause_minutes}
                  onChange={e => setForm({ ...form, human_pause_minutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </div>
              <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar robô
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Conv = {
  id: string; phone: string; contact_name: string | null; last_message: string | null; last_message_at: string | null;
  unread_count: number; needs_human: boolean; bot_paused_until: string | null;
};

function Inbox({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const { data: convs } = useQuery({
    queryKey: ['wa-convs', restaurantId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_conversations')
        .select('id, phone, contact_name, last_message, last_message_at, unread_count, needs_human, bot_paused_until')
        .eq('restaurant_id', restaurantId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(80);
      if (error) throw error;
      return (data || []) as Conv[];
    },
  });
  const conv = convs?.find(c => c.id === active) ?? null;

  const { data: messages } = useQuery({
    queryKey: ['wa-msgs', active],
    enabled: !!active,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_messages')
        .select('id, direction, body, created_at, sent_by, status').eq('conversation_id', active!).order('created_at').limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`wa-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ['wa-convs', restaurantId] }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ['wa-msgs'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  // Abrir a conversa zera o contador de não lidas.
  useEffect(() => {
    if (!conv || conv.unread_count === 0) return;
    supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conv.id)
      .then(() => qc.invalidateQueries({ queryKey: ['wa-convs', restaurantId] }));
  }, [conv, qc, restaurantId]);

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => callBot({ restaurantId, conversationId: active, ...body }),
    onSuccess: (_d, body) => {
      if (body.action === 'send') setText('');
      qc.invalidateQueries({ queryKey: ['wa-convs', restaurantId] });
      qc.invalidateQueries({ queryKey: ['wa-msgs', active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit max-h-[70vh] overflow-y-auto">
        <CardContent className="p-2">
          {!convs?.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
          {convs?.map(c => (
            <button key={c.id} type="button" onClick={() => setActive(c.id)}
              className={cn('flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors', active === c.id ? 'bg-accent' : 'hover:bg-accent/50')}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366]/15 text-[#25d366]"><UserRound className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.contact_name || phoneLabel(c.phone)}</span>
                  {c.needs_human && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Atendente</Badge>}
                  {c.unread_count > 0 && <Badge className="ml-auto h-5 px-1.5 text-[10px]">{c.unread_count}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{c.last_message}</span>
                {c.last_message_at && <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })}</span>}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex min-h-[60vh] flex-col">
        {!conv ? (
          <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Escolha uma conversa.</CardContent>
        ) : (
          <>
            <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0 border-b pb-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">{conv.contact_name || phoneLabel(conv.phone)}</CardTitle>
                <p className="text-xs text-muted-foreground">{phoneLabel(conv.phone)} · {botPaused(conv.bot_paused_until) ? 'robô pausado, atendimento humano' : 'robô atendendo'}</p>
              </div>
              {botPaused(conv.bot_paused_until) ? (
                <Button size="sm" variant="outline" className="gap-2" disabled={act.isPending} onClick={() => act.mutate({ action: 'resume_bot' })}><Bot className="h-4 w-4" /> Devolver ao robô</Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-2" disabled={act.isPending} onClick={() => act.mutate({ action: 'pause_bot' })}><Hand className="h-4 w-4" /> Assumir conversa</Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-2 overflow-y-auto py-4" style={{ maxHeight: '55vh' }}>
              {messages?.map(m => (
                <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                    m.direction === 'out' ? (m.sent_by ? 'bg-primary text-primary-foreground' : 'bg-[#25d366]/20') : 'bg-muted')}>
                    {m.direction === 'out' && !m.sent_by && <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-70"><Bot className="h-3 w-3" /> Robô</span>}
                    {m.body}
                    <span className="mt-0.5 block text-right text-[10px] opacity-60">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </CardContent>
            <form className="flex gap-2 border-t p-3" onSubmit={e => { e.preventDefault(); if (text.trim()) act.mutate({ action: 'send', text }); }}>
              <Input value={text} maxLength={4000} placeholder="Responder como atendente (o robô pausa nesta conversa)" onChange={e => setText(e.target.value)} />
              <Button type="submit" size="icon" aria-label="Enviar" disabled={act.isPending || !text.trim()}>
                {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
