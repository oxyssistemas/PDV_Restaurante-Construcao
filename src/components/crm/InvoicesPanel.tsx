import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Trash2, Printer, FileText, Send, Ban, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { brl } from '@/lib/finance';
import { printHtml, printOrderTicket, renderNfce, type PrintItem } from '@/lib/printing';
import { fiscalApi } from '@/lib/fiscalApi';

interface Props { restaurantId: string; role?: string | null; canEdit?: boolean; restaurantName?: string }

interface Form {
  id?: string; order_id: string; customer_name: string; customer_document: string;
  customer_email: string; customer_address: string; total: string; discount: string; notes: string;
}
const empty: Form = { order_id: '', customer_name: '', customer_document: '', customer_email: '', customer_address: '', total: '', discount: '', notes: '' };

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', pending: 'Emitindo...', issued: 'Autorizada', cancelled: 'Cancelada', error: 'Rejeitada',
};

interface InvoiceItem { name: string; quantity: number; unit_price: number }

export default function InvoicesPanel({ restaurantId, role, canEdit = true, restaurantName = 'Restaurante' }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['fiscal-invoices', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_invoices').select('*').eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    // Enquanto alguma nota está sendo emitida, acompanha sozinho.
    refetchInterval: q => ((q.state.data as { status: string }[] | undefined)?.some(i => i.status === 'pending') ? 5000 : false),
  });

  // Pedidos recentes finalizados, para gerar nota a partir do pedido
  const { data: orders } = useQuery({
    queryKey: ['invoiceable-orders', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, total, customer_name, created_at, order_type, delivery_fee, order_items(quantity, unit_price, menu_items(name))')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const itemsOfOrder = (orderId: string): InvoiceItem[] => {
    const o = (orders || []).find(x => x.id === orderId);
    return ((o?.order_items || []) as Array<{ quantity: number; unit_price: number; menu_items: { name: string } | null }>)
      .map(i => ({ name: i.menu_items?.name || 'Item', quantity: i.quantity, unit_price: Number(i.unit_price) }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.customer_name.trim()) throw new Error('Informe o destinatário');
      const items = form.order_id ? itemsOfOrder(form.order_id) : [];
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const discount = Number(form.discount) || 0;
      const total = Number(form.total) || Math.max(subtotal - discount, 0);
      const payload = {
        restaurant_id: restaurantId,
        order_id: form.order_id || null,
        customer_name: form.customer_name.trim(),
        customer_document: form.customer_document.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_address: form.customer_address.trim() || null,
        items: items as unknown as never,
        subtotal,
        discount,
        total,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const before = (invoices || []).find(i => i.id === form.id);
        const { error } = await supabase.from('fiscal_invoices').update(payload).eq('id', form.id);
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'update', entity: 'invoice', entityId: form.id, summary: `Nota fiscal de "${payload.customer_name}" atualizada (${brl(total)})`, before, after: payload });
      } else {
        const { data, error } = await supabase.from('fiscal_invoices').insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'create', entity: 'invoice', entityId: data?.id, summary: `Nota fiscal criada para "${payload.customer_name}" (${brl(total)})`, after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setOpen(false); setForm(empty);
      toast.success('Nota fiscal salva');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issue = useMutation({
    mutationFn: async (id: string) => {
      const before = (invoices || []).find(i => i.id === id);
      const res = await fiscalApi.emit(restaurantId, id);
      await logAudit({ restaurantId, role, action: 'issue', entity: 'invoice', entityId: id, summary: `NFC-e de "${before?.customer_name ?? id}" enviada para emissão (${res.invoice.status})` });
      return res;
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      if (res.invoice.status === 'issued') toast.success(`NFC-e ${res.invoice.number} autorizada`);
      else if (res.invoice.status === 'error') toast.error('NFC-e rejeitada', { description: res.invoice.error_message ?? undefined });
      else toast.message('NFC-e em processamento', { description: 'O resultado aparece aqui em instantes.' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const before = (invoices || []).find(i => i.id === id);
      await fiscalApi.cancel(restaurantId, id, reason);
      await logAudit({ restaurantId, role, action: 'status', entity: 'invoice', entityId: id, summary: `NFC-e ${before?.number ?? ''} cancelada: ${reason}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setCancelling(null);
      toast.success('NFC-e cancelada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // DANFE: vai para a impressora de notas (estação) se houver; senão abre a impressão aqui.
  const printDanfe = useMutation({
    mutationFn: async (id: string) => {
      const { printers } = await fiscalApi.print(restaurantId, id);
      if (printers > 0) return 'queue';
      const { document } = await fiscalApi.danfe(restaurantId, id);
      await printHtml(await renderNfce(document));
      return 'local';
    },
    onSuccess: where => { if (where === 'queue') toast.success('DANFE enviado para a impressora'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = (invoices || []).find(i => i.id === id);
      const { error } = await supabase.from('fiscal_invoices').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'delete', entity: 'invoice', entityId: id, summary: `Nota fiscal de "${before?.customer_name ?? id}" excluída`, before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success('Nota excluída');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printInvoice = (inv: NonNullable<typeof invoices>[number]) => {
    const items = ((inv.items as unknown as InvoiceItem[]) || []).map<PrintItem>(i => ({
      name: i.name, quantity: i.quantity, unit_price: i.unit_price,
    }));
    printOrderTicket({
      restaurantName,
      title: inv.status === 'issued' ? `NF ${inv.number || ''}` : 'Pre-nota (sem valor fiscal)',
      order: {
        id: inv.id,
        created_at: inv.created_at,
        customer_name: inv.customer_name,
        customer_address: inv.customer_address,
        total: Number(inv.total),
      },
      items,
    });
    logAudit({ restaurantId, role, action: 'print', entity: 'invoice', entityId: inv.id, summary: `Nota fiscal de "${inv.customer_name}" impressa` });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          Notas fiscais de consumidor (NFC-e). Com a emissão automática ligada na configuração fiscal, a nota sai sozinha quando a conta é quitada; aqui você acompanha, reemite, cancela e imprime o DANFE.
        </p>
        {canEdit && (
          <Button className="gap-2" onClick={() => { setForm(empty); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova nota
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (invoices || []).length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhuma nota registrada.</p>
      ) : (
        <div className="space-y-2">
          {(invoices || []).map(inv => (
            <Card key={inv.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <FileText className="h-4 w-4 text-primary" />
                <div className="min-w-[200px] flex-1">
                  <div className="font-semibold">{inv.customer_name || 'Consumidor'}</div>
                  <div className="text-sm text-muted-foreground">
                    {inv.customer_document ? `${inv.customer_document} · ` : ''}
                    {new Date(inv.created_at).toLocaleString('pt-BR')}
                    {inv.number ? ` · NFC-e ${inv.number}${inv.series ? ` série ${inv.series}` : ''}` : ''}
                    {inv.status === 'issued' && inv.environment === 'homologation' ? ' · homologação (sem valor fiscal)' : ''}
                  </div>
                  {inv.access_key && <div className="font-mono text-xs text-muted-foreground">Chave {inv.access_key}</div>}
                  {inv.status === 'error' && inv.error_message && <div className="text-xs text-destructive">{inv.error_message}</div>}
                  {inv.status === 'cancelled' && inv.cancel_reason && <div className="text-xs text-muted-foreground">Cancelada: {inv.cancel_reason}</div>}
                </div>
                <div className="text-lg font-bold">{brl(Number(inv.total))}</div>
                <Badge variant={inv.status === 'issued' ? 'secondary' : inv.status === 'error' ? 'destructive' : 'outline'}>
                  {statusLabels[inv.status]}
                </Badge>
                <div className="flex gap-1">
                  {inv.status === 'issued' ? (
                    <Button size="icon" variant="ghost" title="Imprimir DANFE" disabled={printDanfe.isPending} onClick={() => printDanfe.mutate(inv.id)}>
                      {printDanfe.isPending && printDanfe.variables === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" title="Imprimir pré-nota" onClick={() => printInvoice(inv)}><Printer className="h-4 w-4" /></Button>
                  )}
                  {canEdit && (inv.status === 'draft' || inv.status === 'error') && (
                    <Button size="sm" variant="outline" className="gap-1" disabled={issue.isPending} onClick={() => issue.mutate(inv.id)}>
                      {issue.isPending && issue.variables === inv.id ? <Loader2 className="h-4 w-4 animate-spin" />
                        : inv.status === 'error' ? <RotateCw className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      {inv.status === 'error' ? 'Tentar de novo' : 'Emitir NFC-e'}
                    </Button>
                  )}
                  {canEdit && (inv.status === 'issued' || inv.status === 'pending') && (
                    <Button size="icon" variant="ghost" title="Cancelar NFC-e" onClick={() => setCancelling({ id: inv.id, reason: '' })}>
                      <Ban className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  {canEdit && inv.status !== 'issued' && inv.status !== 'pending' && inv.status !== 'cancelled' && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => {
                        setForm({
                          id: inv.id, order_id: inv.order_id || '', customer_name: inv.customer_name || '',
                          customer_document: inv.customer_document || '', customer_email: inv.customer_email || '',
                          customer_address: inv.customer_address || '', total: String(inv.total),
                          discount: String(inv.discount), notes: inv.notes || '',
                        });
                        setOpen(true);
                      }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(inv.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!cancelling} onOpenChange={o => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar NFC-e</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A SEFAZ aceita o cancelamento em até 30 minutos depois da autorização. Informe o motivo (mínimo 15 caracteres).</p>
          <Textarea rows={3} value={cancelling?.reason ?? ''} placeholder="Ex.: cliente desistiu da compra após a emissão"
            onChange={e => setCancelling(c => (c ? { ...c, reason: e.target.value } : c))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Voltar</Button>
            <Button variant="destructive" disabled={!cancelling || cancelling.reason.trim().length < 15 || cancel.isPending}
              onClick={() => cancelling && cancel.mutate({ id: cancelling.id, reason: cancelling.reason.trim() })}>
              {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancelar nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Editar nota fiscal' : 'Nova nota fiscal'}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1">
              <Label>Pedido de origem</Label>
              <Select
                value={form.order_id || 'none'}
                onValueChange={v => {
                  if (v === 'none') { setForm({ ...form, order_id: '' }); return; }
                  const o = (orders || []).find(x => x.id === v);
                  setForm({
                    ...form,
                    order_id: v,
                    customer_name: form.customer_name || o?.customer_name || 'Consumidor',
                    total: o ? String(o.total) : form.total,
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sem pedido (manual)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem pedido (manual)</SelectItem>
                  {(orders || []).map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      #{o.id.slice(0, 6).toUpperCase()} · {o.customer_name || 'Sem nome'} · {brl(Number(o.total))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Destinatário *</Label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CPF/CNPJ</Label><Input value={form.customer_document} onChange={e => setForm({ ...form, customer_document: e.target.value })} /></div>
              <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Endereço</Label><Input value={form.customer_address} onChange={e => setForm({ ...form, customer_address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Desconto (R$)</Label><Input type="number" step="0.01" min="0" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} /></div>
              <div className="space-y-1"><Label>Total (R$)</Label><Input type="number" step="0.01" min="0" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending} className="gap-2">
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
