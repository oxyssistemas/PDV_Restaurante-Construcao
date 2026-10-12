import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Barcode, CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl, downloadCsv } from '@/lib/finance';
import { edgeErrorMessage } from '@/lib/functionError';
import { waLink } from '@/lib/deliveryStore';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'accounts_receivable'>;
type Form = { id?: string; customer_name: string; customer_document: string; customer_email: string; customer_phone: string; description: string; category: string; amount: string; due_date: string; notes: string };
const today = () => new Date().toISOString().slice(0, 10);
const empty: Form = { customer_name: '', customer_document: '', customer_email: '', customer_phone: '', description: '', category: '', amount: '', due_date: today(), notes: '' };

/** Contas a receber: eventos, convênios, vendas a prazo; boleto/Pix pelo Asaas com baixa automática. */
export default function ReceivablesPanel({ restaurantId, canEdit = true }: { restaurantId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'received' | 'all'>('open');
  const [charge, setCharge] = useState<Row | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['receivables', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts_receivable').select('*').eq('restaurant_id', restaurantId).order('due_date');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: integ } = useQuery({
    queryKey: ['finance-integration', restaurantId],
    queryFn: async () => (await supabase.rpc('finance_integration_status', { _restaurant_id: restaurantId })).data as { asaas?: boolean } | null,
  });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const amount = Number(f.amount.replace(',', '.'));
      if (f.description.trim().length < 2) throw new Error('Informe a descrição.');
      if (!(amount > 0)) throw new Error('Informe o valor.');
      const row = {
        restaurant_id: restaurantId, customer_name: f.customer_name.trim() || null, customer_document: f.customer_document.replace(/\D/g, '') || null,
        customer_email: f.customer_email.trim() || null, customer_phone: f.customer_phone.replace(/\D/g, '') || null,
        description: f.description.trim(), category: f.category.trim() || null, amount, due_date: f.due_date, notes: f.notes.trim() || null,
        ...(f.id ? {} : { created_by: user?.id ?? null }),
      };
      const { error } = f.id ? await supabase.from('accounts_receivable').update(row).eq('id', f.id) : await supabase.from('accounts_receivable').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['receivables', restaurantId] }); setForm(null); toast.success('Conta a receber salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ r, status }: { r: Row; status: string }) => {
      const { error } = status === 'deleted'
        ? await supabase.from('accounts_receivable').delete().eq('id', r.id)
        : await supabase.from('accounts_receivable').update({ status, received_at: status === 'received' ? new Date().toISOString() : null }).eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receivables', restaurantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const boleto = useMutation({
    mutationFn: async (r: Row) => {
      const { data, error } = await supabase.functions.invoke('asaas', { body: { action: 'boleto', restaurantId, receivableId: r.id } });
      const msg = error ? await edgeErrorMessage(error) : (data as { error?: string })?.error;
      if (msg) throw new Error(msg);
      return r;
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['receivables', restaurantId] });
      const { data } = await supabase.from('accounts_receivable').select('*').eq('id', r.id).single();
      setCharge(data);
      toast.success('Cobrança gerada: boleto e Pix');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const now = today();
  const list = (rows ?? []).filter(r => filter === 'all' || (filter === 'received' ? r.status === 'received'
    : filter === 'overdue' ? r.status === 'open' && r.due_date < now : r.status === 'open'));
  const openTotal = (rows ?? []).filter(r => r.status === 'open').reduce((s, r) => s + Number(r.amount), 0);
  const overdueTotal = (rows ?? []).filter(r => r.status === 'open' && r.due_date < now).reduce((s, r) => s + Number(r.amount), 0);
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Copiado'); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">A receber</p><p className="text-2xl font-bold">{brl(openTotal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vencido</p><p className={cn('text-2xl font-bold', overdueTotal > 0 && 'text-destructive')}>{brl(overdueTotal)}</p></CardContent></Card>
        <Card><CardContent className="flex h-full items-center p-4">
          {canEdit && <Button className="w-full gap-2" onClick={() => setForm({ ...empty })}><Plus className="h-4 w-4" /> Nova conta a receber</Button>}
        </CardContent></Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'overdue', 'received', 'all'] as const).map(k => (
          <Button key={k} size="sm" variant={filter === k ? 'default' : 'outline'} onClick={() => setFilter(k)}>
            {{ open: 'Em aberto', overdue: 'Vencidas', received: 'Recebidas', all: 'Todas' }[k]}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => downloadCsv(`contas-a-receber-${now}.csv`, [
          ['Vencimento', 'Cliente', 'Descrição', 'Valor', 'Situação'],
          ...list.map(r => [r.due_date, r.customer_name ?? '', r.description, Number(r.amount).toFixed(2), r.status]),
        ])}>Exportar CSV</Button>
      </div>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : !list.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nada aqui.</p>
      ) : (
        <div className="space-y-2">
          {list.map(r => {
            const late = r.status === 'open' && r.due_date < now;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.description}</span>
                    {r.status === 'received' && <Badge className="bg-[hsl(var(--success))] text-white">Recebida</Badge>}
                    {late && <Badge variant="destructive">Vencida</Badge>}
                    {r.boleto_id && r.status === 'open' && <Badge variant="outline">Boleto/Pix gerado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{r.customer_name ?? 'Sem cliente'} · vence {new Date(`${r.due_date}T12:00`).toLocaleDateString('pt-BR')}{r.category ? ` · ${r.category}` : ''}</p>
                </div>
                <span className="font-semibold">{brl(Number(r.amount))}</span>
                {canEdit && r.status === 'open' && (
                  <div className="flex flex-wrap gap-1">
                    {r.boleto_id ? (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setCharge(r)}><Barcode className="h-3.5 w-3.5" /> Cobrança</Button>
                    ) : integ?.asaas ? (
                      <Button size="sm" variant="outline" className="gap-1" disabled={boleto.isPending} onClick={() => boleto.mutate(r)}>
                        {boleto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Barcode className="h-3.5 w-3.5" />} Gerar boleto/Pix
                      </Button>
                    ) : null}
                    <Button size="sm" className="gap-1" onClick={() => setStatus.mutate({ r, status: 'received' })}><CheckCircle2 className="h-3.5 w-3.5" /> Recebi</Button>
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setForm({
                      id: r.id, customer_name: r.customer_name ?? '', customer_document: r.customer_document ?? '', customer_email: r.customer_email ?? '',
                      customer_phone: r.customer_phone ?? '', description: r.description, category: r.category ?? '', amount: String(r.amount), due_date: r.due_date, notes: r.notes ?? '',
                    })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" className="text-destructive" onClick={() => setStatus.mutate({ r, status: 'deleted' })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!integ?.asaas && <p className="text-xs text-muted-foreground">Para gerar boleto e Pix com baixa automática, ligue sua conta Asaas em Admin → Configurações.</p>}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? 'Editar' : 'Nova'} conta a receber</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ar-desc">Descrição</Label><Input id="ar-desc" placeholder="Ex.: Evento de aniversário, convênio empresa X" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-amount">Valor (R$)</Label><Input id="ar-amount" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-due">Vencimento</Label><Input id="ar-due" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-name">Cliente</Label><Input id="ar-name" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-doc">CPF/CNPJ (para boleto)</Label><Input id="ar-doc" inputMode="numeric" value={form.customer_document} onChange={e => setForm({ ...form, customer_document: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-phone">WhatsApp</Label><Input id="ar-phone" inputMode="tel" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-email">Email</Label><Input id="ar-email" type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-cat">Categoria</Label><Input id="ar-cat" placeholder="Ex.: Eventos" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ar-notes">Observação</Label><Input id="ar-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!charge} onOpenChange={o => !o && setCharge(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Cobrança · {charge && brl(Number(charge.amount))}</DialogTitle></DialogHeader>
          {charge && (
            <div className="space-y-3 text-sm">
              {charge.boleto_url && <Button asChild variant="outline" className="w-full gap-2"><a href={charge.boleto_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir fatura (boleto e Pix)</a></Button>}
              {charge.boleto_barcode && (
                <div className="space-y-1"><Label>Linha digitável</Label>
                  <div className="flex gap-2"><Input readOnly value={charge.boleto_barcode} className="font-mono text-xs" /><Button size="icon" variant="outline" aria-label="Copiar linha digitável" onClick={() => copy(charge.boleto_barcode!)}><Copy className="h-4 w-4" /></Button></div></div>
              )}
              {charge.pix_code && (
                <div className="space-y-1"><Label>Pix copia e cola</Label>
                  <div className="flex gap-2"><Input readOnly value={charge.pix_code} className="font-mono text-xs" /><Button size="icon" variant="outline" aria-label="Copiar Pix" onClick={() => copy(charge.pix_code!)}><Copy className="h-4 w-4" /></Button></div></div>
              )}
              {charge.customer_phone && charge.boleto_url && (
                <Button className="w-full gap-2" onClick={() => window.open(waLink(charge.customer_phone!.length <= 11 ? `55${charge.customer_phone}` : charge.customer_phone!,
                  `Olá${charge.customer_name ? `, ${charge.customer_name}` : ''}! Segue a cobrança de ${brl(Number(charge.amount))} (${charge.description}), vencimento ${new Date(`${charge.due_date}T12:00`).toLocaleDateString('pt-BR')}: ${charge.boleto_url}`), '_blank', 'noopener')}>
                  <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Quando o cliente pagar, a conta dá baixa sozinha (aviso do Asaas).</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
