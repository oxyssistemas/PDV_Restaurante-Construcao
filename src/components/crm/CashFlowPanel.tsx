import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, FileUp, Loader2, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { brl } from '@/lib/finance';
import { parseOfx } from '@/lib/ofx';
import { cn } from '@/lib/utils';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const round2 = (n: number) => Math.round(n * 100) / 100;
type Settle = { date: string; amount: number; gross: number; method: string };

/** Taxas e prazos da maquininha + recebíveis de cartão previstos (o que ainda vai cair na conta). */
function useCardFlow(restaurantId: string) {
  return useQuery({
    queryKey: ['card-flow', restaurantId],
    queryFn: async () => {
      const [{ data: cs }, { data: pays }] = await Promise.all([
        supabase.from('card_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('payments').select('amount, method, created_at').eq('restaurant_id', restaurantId)
          .in('method', ['credit_card', 'debit_card', 'pix']).gte('created_at', addDays(new Date(), -65).toISOString()),
      ]);
      const s = cs ?? { debit_fee: 1.5, debit_days: 1, credit_fee: 3.5, credit_days: 30, pix_fee: 0, opening_balance: 0, opening_balance_on: null };
      const settles: Settle[] = (pays ?? []).map(p => {
        const fee = p.method === 'credit_card' ? Number(s.credit_fee) : p.method === 'debit_card' ? Number(s.debit_fee) : Number(s.pix_fee);
        const days = p.method === 'credit_card' ? s.credit_days : p.method === 'debit_card' ? s.debit_days : 0;
        return { date: iso(addDays(new Date(p.created_at), days)), gross: Number(p.amount), amount: round2(Number(p.amount) * (1 - fee / 100)), method: p.method };
      });
      return { settings: s, settles };
    },
  });
}

/** Fluxo de caixa projetado: saldo de hoje + o que entra (contas a receber, cartões) − o que sai (contas a pagar). */
export function CashFlowPanel({ restaurantId, canEdit = true }: { restaurantId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState(30);
  const { data: card } = useCardFlow(restaurantId);
  const [cfg, setCfg] = useState({ debit_fee: '1.5', debit_days: '1', credit_fee: '3.5', credit_days: '30', pix_fee: '0', opening_balance: '0' });
  useEffect(() => {
    if (!card) return;
    const s = card.settings;
    setCfg({ debit_fee: String(s.debit_fee), debit_days: String(s.debit_days), credit_fee: String(s.credit_fee), credit_days: String(s.credit_days), pix_fee: String(s.pix_fee), opening_balance: String(s.opening_balance) });
  }, [card]);

  const { data: bills } = useQuery({
    queryKey: ['cashflow-bills', restaurantId],
    queryFn: async () => {
      const [{ data: pay }, { data: rec }] = await Promise.all([
        supabase.from('accounts_payable').select('amount, due_date, description').eq('restaurant_id', restaurantId).eq('status', 'open'),
        supabase.from('accounts_receivable').select('amount, due_date, description').eq('restaurant_id', restaurantId).eq('status', 'open'),
      ]);
      return { pay: pay ?? [], rec: rec ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const v = (k: keyof typeof cfg) => Number(cfg[k].replace(',', '.')) || 0;
      const { error } = await supabase.from('card_settings').upsert({
        restaurant_id: restaurantId, debit_fee: v('debit_fee'), debit_days: Math.trunc(v('debit_days')), credit_fee: v('credit_fee'),
        credit_days: Math.trunc(v('credit_days')), pix_fee: v('pix_fee'), opening_balance: v('opening_balance'), opening_balance_on: iso(new Date()),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['card-flow', restaurantId] }); toast.success('Salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const flow = useMemo(() => {
    if (!card || !bills) return null;
    const start = iso(new Date());
    const end = iso(addDays(new Date(), horizon));
    const days = Array.from({ length: horizon + 1 }, (_, i) => iso(addDays(new Date(), i)));
    const inDay = (d: string, list: { due_date?: string; date?: string; amount: number | string }[], key: 'due_date' | 'date') =>
      list.filter(x => (x[key] as string) === d || (d === start && (x[key] as string) < start)).reduce((s, x) => s + Number(x.amount), 0);
    let bal = Number(card.settings.opening_balance);
    const rows = days.map(d => {
      const cardIn = inDay(d, card.settles.filter(s => s.date >= iso(new Date(card.settings.opening_balance_on ?? start))), 'date');
      const recIn = inDay(d, bills.rec, 'due_date');
      const out = inDay(d, bills.pay, 'due_date');
      bal = round2(bal + cardIn + recIn - out);
      return { d, label: format(new Date(`${d}T12:00`), 'dd/MM'), cardIn: round2(cardIn), recIn: round2(recIn), out: round2(out), bal };
    });
    return { rows, end, min: Math.min(...rows.map(r => r.bal)), cardTotal: rows.reduce((s, r) => s + r.cardIn, 0), recTotal: rows.reduce((s, r) => s + r.recIn, 0), outTotal: rows.reduce((s, r) => s + r.out, 0) };
  }, [card, bills, horizon]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fluxo de caixa projetado</CardTitle>
          <CardDescription>Saldo de hoje + vendas no cartão que ainda vão cair (com a taxa da maquininha) + contas a receber − contas a pagar. Vencidos entram hoje.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label htmlFor="cf-bal">Saldo em conta hoje (R$)</Label>
              <Input id="cf-bal" inputMode="decimal" className="w-40" value={cfg.opening_balance} onChange={e => setCfg({ ...cfg, opening_balance: e.target.value })} /></div>
            {canEdit && <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>Atualizar saldo</Button>}
            <div className="ml-auto flex gap-1">
              {[30, 60, 90].map(h => <Button key={h} size="sm" variant={horizon === h ? 'default' : 'outline'} onClick={() => setHorizon(h)}>{h} dias</Button>)}
            </div>
          </div>
          {!flow ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Entra de cartões/Pix</p><p className="text-lg font-bold text-[hsl(var(--success))]">{brl(flow.cardTotal)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Contas a receber</p><p className="text-lg font-bold text-[hsl(var(--success))]">{brl(flow.recTotal)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Contas a pagar</p><p className="text-lg font-bold text-destructive">{brl(flow.outTotal)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Saldo em {format(new Date(`${flow.end}T12:00`), 'dd/MM')}</p>
                  <p className={cn('text-lg font-bold', flow.rows[flow.rows.length - 1].bal < 0 && 'text-destructive')}>{brl(flow.rows[flow.rows.length - 1].bal)}</p></div>
              </div>
              {flow.min < 0 && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">Atenção: o saldo fica negativo em {flow.rows.find(r => r.bal < 0)?.label}. Antecipe recebíveis ou renegocie vencimentos.</p>}
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <AreaChart data={flow.rows} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={v => brl(Number(v)).replace(',00', '')} />
                    <Tooltip formatter={(v: number) => brl(v)} labelFormatter={l => `Dia ${l}`} />
                    <Area type="monotone" dataKey="bal" name="Saldo" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr><th className="p-2 text-left">Dia</th><th className="p-2 text-right">Cartões</th><th className="p-2 text-right">A receber</th><th className="p-2 text-right">A pagar</th><th className="p-2 text-right">Saldo</th></tr></thead>
                  <tbody>
                    {flow.rows.filter(r => r.cardIn || r.recIn || r.out).map(r => (
                      <tr key={r.d} className="border-t">
                        <td className="p-2">{r.label}</td><td className="p-2 text-right">{r.cardIn ? brl(r.cardIn) : ''}</td>
                        <td className="p-2 text-right">{r.recIn ? brl(r.recIn) : ''}</td><td className="p-2 text-right text-destructive">{r.out ? `-${brl(r.out)}` : ''}</td>
                        <td className={cn('p-2 text-right font-medium', r.bal < 0 && 'text-destructive')}>{brl(r.bal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Taxas e prazos da maquininha</CardTitle>
          <CardDescription>Usados para prever quanto e quando cada venda no cartão cai na conta, e na conciliação do extrato.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          {([['debit_fee', 'Débito (%)'], ['debit_days', 'Débito cai em (dias)'], ['credit_fee', 'Crédito (%)'], ['credit_days', 'Crédito cai em (dias)'], ['pix_fee', 'Pix (%)']] as const).map(([k, l]) => (
            <div key={k} className="space-y-1.5"><Label>{l}</Label><Input inputMode="decimal" value={cfg[k]} onChange={e => setCfg({ ...cfg, [k]: e.target.value })} /></div>
          ))}
          {canEdit && <Button className="sm:col-span-5 sm:w-fit" disabled={save.isPending} onClick={() => save.mutate()}>Salvar taxas</Button>}
        </CardContent>
      </Card>
    </div>
  );
}

/** Extrato do banco (OFX) e conciliação com contas a pagar/receber e repasses de cartão. */
export function BankReconcilePanel({ restaurantId, canEdit = true }: { restaurantId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState<'open' | 'done'>('open');
  const { data: card } = useCardFlow(restaurantId);

  const { data } = useQuery({
    queryKey: ['bank-tx', restaurantId],
    queryFn: async () => {
      const [{ data: tx }, { data: pay }, { data: rec }] = await Promise.all([
        supabase.from('bank_transactions').select('*').eq('restaurant_id', restaurantId).order('posted_on', { ascending: false }).limit(500),
        supabase.from('accounts_payable').select('id, amount, due_date, description').eq('restaurant_id', restaurantId).eq('status', 'open'),
        supabase.from('accounts_receivable').select('id, amount, due_date, description').eq('restaurant_id', restaurantId).eq('status', 'open'),
      ]);
      return { tx: tx ?? [], pay: pay ?? [], rec: rec ?? [] };
    },
  });

  const upload = async (f: File) => {
    try {
      const st = parseOfx(await f.text());
      if (!st.transactions.length) throw new Error('O extrato não tem lançamentos.');
      const { error } = await supabase.from('bank_transactions').upsert(
        st.transactions.map(t => ({ restaurant_id: restaurantId, account: st.account, fitid: t.fitid, posted_on: t.posted_on, amount: t.amount, memo: t.memo })),
        { onConflict: 'restaurant_id,account,fitid', ignoreDuplicates: true },
      );
      if (error) throw error;
      if (st.balance != null) await supabase.from('card_settings').upsert({ restaurant_id: restaurantId, opening_balance: st.balance, opening_balance_on: st.balance_on ?? iso(new Date()) });
      qc.invalidateQueries({ queryKey: ['bank-tx', restaurantId] });
      qc.invalidateQueries({ queryKey: ['card-flow', restaurantId] });
      toast.success(`${st.transactions.length} lançamento(s) lidos${st.balance != null ? ` · saldo ${brl(st.balance)}` : ''}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { if (file.current) file.current.value = ''; }
  };

  /** Sugestão: mesmo valor e data próxima (contas) ou soma dos cartões previstos para o dia (repasse da maquininha). */
  const suggest = (t: { amount: number; posted_on: string }) => {
    const amt = Math.abs(Number(t.amount));
    const near = (d: string, days = 5) => Math.abs(new Date(`${d}T12:00`).getTime() - new Date(`${t.posted_on}T12:00`).getTime()) <= days * 864e5;
    if (Number(t.amount) < 0) {
      const p = data?.pay.find(x => Math.abs(Number(x.amount) - amt) < 0.01 && near(x.due_date));
      return p ? { type: 'payable' as const, id: p.id, note: `Conta a pagar: ${p.description}` } : null;
    }
    const r = data?.rec.find(x => Math.abs(Number(x.amount) - amt) < 0.01 && near(x.due_date));
    if (r) return { type: 'receivable' as const, id: r.id, note: `Conta a receber: ${r.description}` };
    const cardDay = (card?.settles ?? []).filter(s => s.date === t.posted_on && s.method !== 'pix').reduce((s, x) => s + x.amount, 0);
    if (cardDay > 0 && Math.abs(cardDay - amt) / cardDay < 0.03) return { type: 'card' as const, id: null, note: `Repasse dos cartões previsto: ${brl(cardDay)}` };
    return null;
  };

  const match = useMutation({
    mutationFn: async ({ t, type, id, note }: { t: { id: string; posted_on: string }; type: 'payable' | 'receivable' | 'card' | 'ignored'; id: string | null; note: string }) => {
      if (type === 'payable' && id) await supabase.from('accounts_payable').update({ status: 'paid', paid_at: `${t.posted_on}T12:00:00-03:00` }).eq('id', id);
      if (type === 'receivable' && id) await supabase.from('accounts_receivable').update({ status: 'received', received_at: `${t.posted_on}T12:00:00-03:00` }).eq('id', id);
      const { error } = await supabase.from('bank_transactions').update({ matched_type: type, matched_id: id, matched_note: note, reconciled_at: new Date().toISOString() }).eq('id', t.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-tx', restaurantId] }); qc.invalidateQueries({ queryKey: ['receivables'] }); qc.invalidateQueries({ queryKey: ['crm-payables'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (data?.tx ?? []).filter(t => (show === 'open' ? !t.reconciled_at : !!t.reconciled_at));
  const pending = (data?.tx ?? []).filter(t => !t.reconciled_at).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Extrato do banco e conciliação</CardTitle>
        <CardDescription>Envie o extrato OFX do banco (Internet Banking → exportar OFX). O sistema sugere o que é cada lançamento: conta a pagar, conta a receber ou repasse da maquininha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={file} type="file" accept=".ofx,.OFX" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <Button className="gap-2" onClick={() => file.current?.click()}><FileUp className="h-4 w-4" /> Enviar extrato OFX</Button>}
          <Button size="sm" variant={show === 'open' ? 'default' : 'outline'} onClick={() => setShow('open')}>A conciliar ({pending})</Button>
          <Button size="sm" variant={show === 'done' ? 'default' : 'outline'} onClick={() => setShow('done')}>Conciliados</Button>
        </div>
        {!list.length ? <p className="py-6 text-center text-sm text-muted-foreground">{show === 'open' ? 'Nada para conciliar.' : 'Nenhum lançamento conciliado ainda.'}</p> : (
          <div className="space-y-2">
            {list.map(t => {
              const s = show === 'open' ? suggest(t) : null;
              const amount = Number(t.amount);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                  <span className="w-12 text-xs text-muted-foreground">{format(new Date(`${t.posted_on}T12:00`), 'dd/MM')}</span>
                  <span className="min-w-0 flex-1 truncate">{t.memo || 'Lançamento'}</span>
                  <span className={cn('font-semibold', amount < 0 ? 'text-destructive' : 'text-[hsl(var(--success))]')}>{brl(amount)}</span>
                  {show === 'done' ? <Badge variant="outline">{t.matched_note || t.matched_type}</Badge> : canEdit && (
                    <div className="flex flex-wrap items-center gap-1">
                      {s && <Button size="sm" className="gap-1" onClick={() => match.mutate({ t, ...s })}><CheckCircle2 className="h-3.5 w-3.5" /> {s.note}</Button>}
                      <Select value="" onValueChange={v => {
                        const [type, id] = v.split(':');
                        const label = type === 'payable' ? data?.pay.find(x => x.id === id)?.description : type === 'receivable' ? data?.rec.find(x => x.id === id)?.description : null;
                        match.mutate({ t, type: type as 'payable', id: id || null, note: type === 'ignored' ? 'Ignorado' : type === 'card' ? 'Repasse de cartão' : `${type === 'payable' ? 'Conta a pagar' : 'Conta a receber'}: ${label}` });
                      }}>
                        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Conciliar com…" /></SelectTrigger>
                        <SelectContent>
                          {amount < 0
                            ? data?.pay.map(p => <SelectItem key={p.id} value={`payable:${p.id}`}>{p.description} · {brl(Number(p.amount))}</SelectItem>)
                            : data?.rec.map(r => <SelectItem key={r.id} value={`receivable:${r.id}`}>{r.description} · {brl(Number(r.amount))}</SelectItem>)}
                          {amount > 0 && <SelectItem value="card:">Repasse de cartão</SelectItem>}
                          <SelectItem value="ignored:">Ignorar (outro lançamento)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Open Finance (extrato automático sem arquivo) depende de contrato com uma empresa autorizada pelo Banco Central.</p>
      </CardContent>
    </Card>
  );
}
