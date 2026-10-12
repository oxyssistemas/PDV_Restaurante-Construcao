import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
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
import { Download, Loader2, MessageSquareHeart, Reply, Settings2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/finance';
import { orderTypeLabels } from '@/lib/orders';
import { isAdminLike } from '@/lib/roles';
import { cn } from '@/lib/utils';
/** NPS = % promotores (9–10) − % detratores (0–6). */
function npsOf(list: { score: number }[]) {
  if (!list.length) return null;
  const pro = list.filter(r => r.score >= 9).length, det = list.filter(r => r.score <= 6).length;
  return Math.round(((pro - det) / list.length) * 100);
}
const npsTone = (v: number | null) => (v == null ? 'text-muted-foreground' : v >= 50 ? 'text-emerald-500' : v >= 0 ? 'text-amber-500' : 'text-destructive');
const npsZone = (v: number | null) => (v == null ? '' : v >= 75 ? 'Excelente' : v >= 50 ? 'Muito bom' : v >= 0 ? 'Razoável' : 'Crítico');
const scoreBadge = (n: number) => (n >= 9 ? 'bg-emerald-500/15 text-emerald-500' : n >= 7 ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500');
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export default function ReviewsPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const canManage = isAdminLike(currentRole?.role);
  const qc = useQueryClient();
  const [days, setDays] = useState('30');
  const [filter, setFilter] = useState<'all' | 'pro' | 'neutral' | 'det'>('all');
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['order-reviews', restaurantId, days],
    enabled: !!restaurantId,
    queryFn: async () => {
      const since = `${format(subDays(new Date(), Number(days) - 1), 'yyyy-MM-dd')}T00:00:00`;
      const { data, error } = await supabase.from('order_reviews').select('*')
        .eq('restaurant_id', restaurantId!).gte('created_at', since).order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return data;
    },
  });

  const list = useMemo(() => (reviews ?? []).filter(r =>
    filter === 'all' || (filter === 'pro' ? r.score >= 9 : filter === 'det' ? r.score <= 6 : r.score >= 7 && r.score <= 8)), [reviews, filter]);

  const all = reviews ?? [];
  const nps = npsOf(all);
  const dist = Array.from({ length: 11 }, (_, n) => all.filter(r => r.score === n).length);
  const maxDist = Math.max(1, ...dist);

  const sendReply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('order_reviews').update({ reply: reply.trim() || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-reviews'] }); setReplying(null); setReply(''); toast.success('Resposta salva. O cliente vê pelo mesmo link da avaliação.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => downloadCsv(`avaliacoes-${format(new Date(), 'yyyy-MM-dd')}.csv`, [
    ['Data', 'Nota', 'Comida', 'Atendimento', 'Tempo', 'Cliente', 'Telefone', 'Tipo', 'Comentário', 'Resposta'],
    ...list.map(r => [new Date(r.created_at).toLocaleString('pt-BR'), r.score, r.food_score ?? '', r.service_score ?? '', r.speed_score ?? '',
      r.customer_name ?? '', r.customer_phone ?? '', orderTypeLabels[r.order_type ?? ''] ?? r.order_type ?? '', r.comment ?? '', r.reply ?? '']),
  ]);

  if (!restaurantId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><MessageSquareHeart className="h-7 w-7 text-primary" /> Avaliações (NPS)</h1>
          <p className="text-sm text-muted-foreground">O cliente avalia pelo QR Code do recibo ou pelo acompanhamento do pedido online.</p>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportCsv} disabled={!list.length}><Download className="h-4 w-4" /> Planilha</Button>
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">NPS</div>
              <div className={cn('text-3xl font-bold', npsTone(nps))}>{nps ?? '—'}</div>
              <div className="text-[11px] text-muted-foreground">{npsZone(nps)} · {all.length} avaliação(ões)</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Promotores / Neutros / Detratores</div>
              <div className="mt-1 flex gap-3 text-lg font-bold">
                <span className="text-emerald-500">{all.filter(r => r.score >= 9).length}</span>
                <span className="text-amber-500">{all.filter(r => r.score >= 7 && r.score <= 8).length}</span>
                <span className="text-destructive">{all.filter(r => r.score <= 6).length}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">notas 9–10 · 7–8 · 0–6</div>
            </CardContent></Card>
            <Card className="md:col-span-2"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Médias (1 a 5 estrelas)</div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {([['Comida', 'food_score'], ['Atendimento', 'service_score'], ['Tempo de espera', 'speed_score']] as const).map(([label, key]) => {
                  const v = avg(all.map(r => r[key]));
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-1 text-xl font-bold">{v == null ? '—' : v.toFixed(1)} <Star className="h-4 w-4 fill-amber-400 text-amber-400" /></div>
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Distribuição das notas</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-28 items-end gap-1.5">
                {dist.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{n || ''}</span>
                    <div className={cn('w-full rounded-t', i >= 9 ? 'bg-emerald-500' : i >= 7 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ height: `${(n / maxDist) * 80}px`, minHeight: n ? 4 : 1, opacity: n ? 1 : 0.2 }} />
                    <span className="text-xs">{i}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Comentários</CardTitle>
              <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="det">Detratores (0–6)</SelectItem>
                  <SelectItem value="neutral">Neutros (7–8)</SelectItem>
                  <SelectItem value="pro">Promotores (9–10)</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-3">
              {!list.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma avaliação no período.</p>}
              {list.map(r => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-lg px-2 py-0.5 text-sm font-bold', scoreBadge(r.score))}>{r.score}</span>
                    <span className="font-medium">{r.customer_name || 'Cliente'}</span>
                    {r.order_type && <Badge variant="outline">{orderTypeLabels[r.order_type] ?? r.order_type}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  {(r.food_score || r.service_score || r.speed_score) && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {r.food_score && <span>Comida {r.food_score}★</span>}
                      {r.service_score && <span>Atendimento {r.service_score}★</span>}
                      {r.speed_score && <span>Tempo {r.speed_score}★</span>}
                    </div>
                  )}
                  {r.comment && <p className="mt-2 text-sm">“{r.comment}”</p>}
                  {r.reply && replying !== r.id && (
                    <div className="mt-2 rounded-lg bg-muted/40 p-2 text-sm"><span className="text-xs font-semibold text-primary">Sua resposta: </span>{r.reply}</div>
                  )}
                  {canManage && (replying === r.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea rows={2} value={reply} maxLength={1000} onChange={e => setReply(e.target.value)} placeholder="Resposta que o cliente vai ver no link da avaliação" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => sendReply.mutate(r.id)} disabled={sendReply.isPending}>Salvar resposta</Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="mt-1 h-7 gap-1 px-2 text-xs" onClick={() => { setReplying(r.id); setReply(r.reply ?? ''); }}>
                      <Reply className="h-3.5 w-3.5" /> {r.reply ? 'Editar resposta' : 'Responder'}
                    </Button>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          {canManage && <FeedbackSettingsCard restaurantId={restaurantId} />}
        </>
      )}
    </div>
  );
}

function FeedbackSettingsCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['feedback-settings', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('feedback_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ enabled: true, print_on_receipt: true, alert_score: '6', thank_you: '', google_review_url: '', google_min_score: '9' });
  useEffect(() => {
    if (data) setForm({ enabled: data.enabled, print_on_receipt: data.print_on_receipt, alert_score: String(data.alert_score), thank_you: data.thank_you ?? '', google_review_url: data.google_review_url ?? '', google_min_score: String(data.google_min_score ?? 9) });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const alert = Math.min(10, Math.max(0, parseInt(form.alert_score) || 0));
      const { error } = await supabase.from('feedback_settings').upsert({
        restaurant_id: restaurantId, enabled: form.enabled, print_on_receipt: form.print_on_receipt, alert_score: alert,
        thank_you: form.thank_you.trim() || null,
        google_review_url: form.google_review_url.trim() || null,
        google_min_score: Math.min(10, Math.max(0, parseInt(form.google_min_score) || 9)),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback-settings'] }); toast.success('Configurações das avaliações salvas.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" /> Configurações</CardTitle>
        <CardDescription>Quando a avaliação fica igual ou abaixo da nota de alerta, o admin recebe um aviso na hora.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          Receber avaliações <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          QR Code da avaliação no recibo <Switch checked={form.print_on_receipt} onCheckedChange={v => setForm({ ...form, print_on_receipt: v })} />
        </label>
        <div className="space-y-1.5">
          <Label>Avisar quando a nota for até</Label>
          <Input type="number" min="0" max="10" value={form.alert_score} onChange={e => setForm({ ...form, alert_score: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Mensagem de agradecimento</Label>
          <Input value={form.thank_you} maxLength={160} placeholder="Obrigado! Volte sempre." onChange={e => setForm({ ...form, thank_you: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Link para avaliar no Google (opcional)</Label>
          <Input value={form.google_review_url} placeholder="https://g.page/r/..." onChange={e => setForm({ ...form, google_review_url: e.target.value })} />
          <p className="text-xs text-muted-foreground">No Perfil da Empresa no Google: "Pedir avaliações" → copie o link. Quem der nota alta é convidado a avaliar no Google também.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Convidar para o Google a partir da nota</Label>
          <Input type="number" min="0" max="10" value={form.google_min_score} onChange={e => setForm({ ...form, google_min_score: e.target.value })} />
        </div>
        <Button className="w-fit" onClick={() => {
          if (form.google_review_url.trim() && !/^https:\/\//.test(form.google_review_url.trim())) { toast.error('O link do Google deve começar com https://'); return; }
          save.mutate();
        }} disabled={save.isPending}>Salvar</Button>
      </CardContent>
    </Card>
  );
}
