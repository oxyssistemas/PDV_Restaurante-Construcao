import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BadgePercent, Clock, Loader2, Pencil, Plus, Tag, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { brl } from '@/lib/finance';
import { WEEKDAYS } from '@/lib/menuOptions';
import { CHANNEL_LABELS, KIND_LABELS, promoOnNow, usePromotions, type PromoChannel, type PromoKind, type Promotion } from '@/lib/promotions';
import { useModuleAccess } from '@/hooks/useModuleAccess';

type Form = {
  id?: string; name: string; kind: PromoKind; active: boolean;
  starts_on: string; ends_on: string; days: number[]; time_from: string; time_to: string; channels: PromoChannel[];
  item_ids: string[]; category_ids: string[];
  percent: string; buy_qty: string; pay_qty: string;
  code: string; discount_type: 'percent' | 'amount' | 'free_delivery'; amount: string; min_order: string; max_uses: string; per_customer: string;
};

const empty = (kind: PromoKind): Form => ({
  name: kind === 'happy_hour' ? 'Happy hour' : kind === 'buy_x_pay_y' ? 'Leve 3, pague 2' : 'Cupom de boas-vindas',
  kind, active: true, starts_on: '', ends_on: '', days: [], time_from: kind === 'happy_hour' ? '17:00' : '', time_to: kind === 'happy_hour' ? '20:00' : '',
  channels: kind === 'coupon' ? ['delivery'] : ['salon', 'counter', 'delivery'], item_ids: [], category_ids: [],
  percent: kind === 'happy_hour' ? '20' : kind === 'coupon' ? '10' : '', buy_qty: '3', pay_qty: '2',
  code: '', discount_type: 'percent', amount: '', min_order: '', max_uses: '', per_customer: '1',
});

const toForm = (p: Promotion): Form => ({
  id: p.id, name: p.name, kind: p.kind, active: p.active, starts_on: p.starts_on ?? '', ends_on: p.ends_on ?? '', days: p.days ?? [],
  time_from: p.time_from?.slice(0, 5) ?? '', time_to: p.time_to?.slice(0, 5) ?? '', channels: p.channels, item_ids: p.item_ids, category_ids: p.category_ids,
  percent: p.percent == null ? '' : String(Number(p.percent)), buy_qty: p.buy_qty == null ? '3' : String(p.buy_qty), pay_qty: p.pay_qty == null ? '2' : String(p.pay_qty),
  code: p.code ?? '', discount_type: (p.discount_type as Form['discount_type']) ?? 'percent', amount: p.amount == null ? '' : String(Number(p.amount)),
  min_order: p.min_order ? String(Number(p.min_order)) : '', max_uses: p.max_uses == null ? '' : String(p.max_uses), per_customer: p.per_customer == null ? '' : String(p.per_customer),
});

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

function summary(p: Promotion) {
  const what = p.kind === 'happy_hour' ? `${Number(p.percent)}% de desconto`
    : p.kind === 'buy_x_pay_y' ? `Leve ${p.buy_qty}, pague ${p.pay_qty}`
    : p.discount_type === 'free_delivery' ? 'Entrega grátis'
    : p.discount_type === 'amount' ? `${brl(Number(p.amount))} de desconto` : `${Number(p.percent)}% de desconto`;
  const days = p.days?.length && p.days.length < 7 ? [...p.days].sort().map(d => WEEKDAYS[d]).join(', ') : 'Todos os dias';
  const hours = p.time_from && p.time_to ? `${p.time_from.slice(0, 5)}–${p.time_to.slice(0, 5)}` : 'o dia todo';
  return { what, when: `${days}, ${hours}` };
}

/** Admin → Promoções: happy hour, leve X pague Y e cupons da loja online. */
export default function PromotionsPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const { canEdit: can } = useModuleAccess();
  const canEdit = can('promotions');
  const { data: promos, isLoading } = usePromotions(restaurantId);
  const [form, setForm] = useState<Form | null>(null);
  const [remove, setRemove] = useState<Promotion | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ['promo-catalog', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [{ data: items }, { data: cats }] = await Promise.all([
        supabase.from('menu_items').select('id, name, category_id').eq('restaurant_id', restaurantId!).eq('is_rodizio_charge', false).order('name'),
        supabase.from('menu_categories').select('id, name').eq('restaurant_id', restaurantId!).order('sort_order'),
      ]);
      return { items: items ?? [], categories: cats ?? [] };
    },
  });

  const { data: uses } = useQuery({
    queryKey: ['coupon-uses', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('coupon_redemptions').select('promotion_id, discount').eq('restaurant_id', restaurantId!);
      const map = new Map<string, { n: number; total: number }>();
      (data ?? []).forEach(r => {
        const m = map.get(r.promotion_id) ?? { n: 0, total: 0 };
        map.set(r.promotion_id, { n: m.n + 1, total: m.total + Number(r.discount) });
      });
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (f.name.trim().length < 2) throw new Error('Dê um nome para a promoção.');
      if (!f.channels.length) throw new Error('Escolha pelo menos um canal.');
      const payload = {
        restaurant_id: restaurantId!, name: f.name.trim(), kind: f.kind, active: f.active,
        starts_on: f.starts_on || null, ends_on: f.ends_on || null, days: f.days,
        time_from: f.time_from && f.time_to ? f.time_from : null, time_to: f.time_from && f.time_to ? f.time_to : null,
        channels: f.kind === 'coupon' ? ['delivery'] : f.channels,
        item_ids: f.kind === 'coupon' ? [] : f.item_ids, category_ids: f.kind === 'coupon' ? [] : f.category_ids,
        percent: f.kind === 'happy_hour' || (f.kind === 'coupon' && f.discount_type === 'percent') ? num(f.percent) : null,
        buy_qty: f.kind === 'buy_x_pay_y' ? num(f.buy_qty) : null,
        pay_qty: f.kind === 'buy_x_pay_y' ? num(f.pay_qty) : null,
        code: f.kind === 'coupon' ? f.code.trim().toUpperCase() : null,
        discount_type: f.kind === 'coupon' ? f.discount_type : null,
        amount: f.kind === 'coupon' && f.discount_type === 'amount' ? num(f.amount) : null,
        min_order: f.kind === 'coupon' ? num(f.min_order) ?? 0 : 0,
        max_uses: f.kind === 'coupon' ? num(f.max_uses) : null,
        per_customer: f.kind === 'coupon' ? num(f.per_customer) : null,
      };
      if (f.kind === 'happy_hour' && !(Number(payload.percent) > 0 && Number(payload.percent) <= 100)) throw new Error('Informe o desconto entre 1% e 100%.');
      if (f.kind === 'buy_x_pay_y' && !(Number(payload.buy_qty) >= 2 && Number(payload.pay_qty) >= 1 && Number(payload.pay_qty) < Number(payload.buy_qty))) {
        throw new Error('Em "leve X, pague Y", Y precisa ser menor que X.');
      }
      if (f.kind === 'coupon' && !/^[A-Z0-9_-]{3,20}$/.test(payload.code ?? '')) throw new Error('O código do cupom deve ter de 3 a 20 letras ou números, sem espaço.');
      const { error } = f.id
        ? await supabase.from('promotions').update(payload).eq('id', f.id)
        : await supabase.from('promotions').insert(payload);
      if (error) throw new Error(/promotions_code_uniq/.test(error.message) ? 'Já existe um cupom com esse código.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); setForm(null); toast.success('Promoção salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: Promotion) => {
      const { error } = await supabase.from('promotions').update({ active: !p.active }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (p: Promotion) => {
      const { error } = await supabase.from('promotions').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); setRemove(null); toast.success('Promoção removida'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('min-h-9 rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-primary/40')}>
      {children}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Promoções</h1>
          <p className="text-muted-foreground">Happy hour e "leve X, pague Y" entram sozinhos na conta; cupons valem na loja online.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setForm(empty('happy_hour'))}><Clock className="h-4 w-4" /> Happy hour</Button>
            <Button variant="outline" className="gap-2" onClick={() => setForm(empty('buy_x_pay_y'))}><Tag className="h-4 w-4" /> Leve X, pague Y</Button>
            <Button className="gap-2" onClick={() => setForm(empty('coupon'))}><Ticket className="h-4 w-4" /> Cupom</Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !promos?.length ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <BadgePercent className="h-8 w-8" /> Nenhuma promoção ainda. Crie um happy hour, um "leve 3 pague 2" ou um cupom.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {promos.map(p => {
            const s = summary(p);
            const now = promoOnNow(p);
            const u = uses?.get(p.id);
            return (
              <Card key={p.id} className={cn(!p.active && 'opacity-60')}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.name}</span>
                        {p.kind === 'coupon' && <Badge variant="outline" className="font-mono">{p.code}</Badge>}
                        {p.active && now && <Badge className="bg-[hsl(var(--success))] text-white">Valendo agora</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{KIND_LABELS[p.kind]}</p>
                    </div>
                    {canEdit && <Switch aria-label={p.active ? 'Pausar' : 'Ativar'} checked={p.active} onCheckedChange={() => toggle.mutate(p)} />}
                  </div>
                  <p className="text-sm"><b>{s.what}</b> · {s.when}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.kind === 'coupon'
                      ? `${u?.n ?? 0} uso(s)${p.max_uses ? ` de ${p.max_uses}` : ''} · ${brl(u?.total ?? 0)} em descontos${Number(p.min_order) ? ` · mínimo ${brl(Number(p.min_order))}` : ''}`
                      : `${p.channels.map(c => CHANNEL_LABELS[c]).join(', ')} · ${p.item_ids.length || p.category_ids.length ? `${p.item_ids.length + p.category_ids.length} seleção(ões)` : 'todo o cardápio'}`}
                    {(p.starts_on || p.ends_on) && ` · ${p.starts_on ? new Date(`${p.starts_on}T12:00`).toLocaleDateString('pt-BR') : '…'} a ${p.ends_on ? new Date(`${p.ends_on}T12:00`).toLocaleDateString('pt-BR') : '…'}`}
                  </p>
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setForm(toForm(p))}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => setRemove(p)}><Trash2 className="h-3.5 w-3.5" /> Remover</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? 'Editar' : 'Nova'} promoção · {form && KIND_LABELS[form.kind]}</DialogTitle></DialogHeader>
          {form && (
            <form id="promo-form" className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(form); }}>
              <div className="space-y-2">
                <Label htmlFor="promo-name">Nome</Label>
                <Input id="promo-name" value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {form.kind === 'happy_hour' && (
                <div className="space-y-2">
                  <Label htmlFor="promo-percent">Desconto (%)</Label>
                  <Input id="promo-percent" inputMode="decimal" className="w-32" value={form.percent} onChange={e => setForm({ ...form, percent: e.target.value })} />
                </div>
              )}
              {form.kind === 'buy_x_pay_y' && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2"><Label htmlFor="promo-buy">Leve</Label>
                    <Input id="promo-buy" type="number" min={2} max={20} className="w-24" value={form.buy_qty} onChange={e => setForm({ ...form, buy_qty: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="promo-pay">Pague</Label>
                    <Input id="promo-pay" type="number" min={1} max={19} className="w-24" value={form.pay_qty} onChange={e => setForm({ ...form, pay_qty: e.target.value })} /></div>
                  <p className="pb-2 text-xs text-muted-foreground">Os itens mais baratos do grupo saem de graça.</p>
                </div>
              )}
              {form.kind === 'coupon' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="promo-code">Código</Label>
                    <Input id="promo-code" className="font-mono uppercase" maxLength={20} placeholder="BEMVINDO10" value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.discount_type} onValueChange={(v: Form['discount_type']) => setForm({ ...form, discount_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">% de desconto</SelectItem>
                        <SelectItem value="amount">R$ de desconto</SelectItem>
                        <SelectItem value="free_delivery">Entrega grátis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.discount_type === 'percent' && (
                    <div className="space-y-2"><Label htmlFor="promo-cp">Desconto (%)</Label>
                      <Input id="promo-cp" inputMode="decimal" value={form.percent} onChange={e => setForm({ ...form, percent: e.target.value })} /></div>
                  )}
                  {form.discount_type === 'amount' && (
                    <div className="space-y-2"><Label htmlFor="promo-amount">Desconto (R$)</Label>
                      <Input id="promo-amount" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                  )}
                  <div className="space-y-2"><Label htmlFor="promo-min">Pedido mínimo (R$)</Label>
                    <Input id="promo-min" inputMode="decimal" placeholder="Sem mínimo" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="promo-max">Limite de usos</Label>
                    <Input id="promo-max" type="number" min={1} placeholder="Sem limite" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="promo-per">Usos por cliente</Label>
                    <Input id="promo-per" type="number" min={1} placeholder="Sem limite" value={form.per_customer} onChange={e => setForm({ ...form, per_customer: e.target.value })} /></div>
                </div>
              )}

              {form.kind !== 'coupon' && (
                <>
                  <div className="space-y-2">
                    <Label>Vale em</Label>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(CHANNEL_LABELS) as PromoChannel[]).map(c => (
                        <Chip key={c} on={form.channels.includes(c)}
                          onClick={() => setForm({ ...form, channels: form.channels.includes(c) ? form.channels.filter(x => x !== c) : [...form.channels, c] })}>
                          {CHANNEL_LABELS[c]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Categorias e pratos <span className="font-normal text-muted-foreground">(nada marcado = todo o cardápio)</span></Label>
                    <div className="flex flex-wrap gap-2">
                      {catalog?.categories.map(c => (
                        <Chip key={c.id} on={form.category_ids.includes(c.id)}
                          onClick={() => setForm({ ...form, category_ids: form.category_ids.includes(c.id) ? form.category_ids.filter(x => x !== c.id) : [...form.category_ids, c.id] })}>
                          {c.name} (categoria)
                        </Chip>
                      ))}
                    </div>
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {catalog?.items.map(i => (
                        <Chip key={i.id} on={form.item_ids.includes(i.id)}
                          onClick={() => setForm({ ...form, item_ids: form.item_ids.includes(i.id) ? form.item_ids.filter(x => x !== i.id) : [...form.item_ids, i.id] })}>
                          {i.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Quando vale <span className="font-normal text-muted-foreground">(sem dias = todos; sem horário = o dia todo)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, i) => (
                    <Chip key={d} on={form.days.includes(i)} onClick={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter(x => x !== i) : [...form.days, i].sort() })}>{d}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Das</span>
                  <Input type="time" aria-label="Começa às" className="h-9 w-[120px]" value={form.time_from} onChange={e => setForm({ ...form, time_from: e.target.value })} />
                  <span className="text-muted-foreground">às</span>
                  <Input type="time" aria-label="Termina às" className="h-9 w-[120px]" value={form.time_to} onChange={e => setForm({ ...form, time_to: e.target.value })} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">De</span>
                  <Input type="date" aria-label="Começa em" className="h-9 w-[160px]" value={form.starts_on} onChange={e => setForm({ ...form, starts_on: e.target.value })} />
                  <span className="text-muted-foreground">até</span>
                  <Input type="date" aria-label="Termina em" className="h-9 w-[160px]" value={form.ends_on} onChange={e => setForm({ ...form, ends_on: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="promo-active">Ativa</Label>
                <Switch id="promo-active" checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button type="submit" form="promo-form" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!remove} onOpenChange={o => !o && setRemove(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover "{remove?.name}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pedidos já feitos mantêm o desconto. Para só parar por um tempo, use a chave de pausar.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => remove && del.mutate(remove)}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
