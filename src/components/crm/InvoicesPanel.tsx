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
import { Loader2, Plus, Pencil, Trash2, Printer, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { brl } from '@/lib/finance';
import { printOrderTicket, type PrintItem } from '@/lib/printing';

interface Props { restaurantId: string; role?: string | null; canEdit?: boolean; restaurantName?: string }

interface Form {
  id?: string; order_id: string; customer_name: string; customer_document: string;
  customer_email: string; customer_address: string; total: string; discount: string; notes: string;
}
const empty: Form = { order_id: '', customer_name: '', customer_document: '', customer_email: '', customer_address: '', total: '', discount: '', notes: '' };

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', pending: 'Aguardando emissor', issued: 'Emitida', cancelled: 'Cancelada', error: 'Erro',
};

interface InvoiceItem { name: string; quantity: number; unit_price: number }

export default function InvoicesPanel({ restaurantId, role, canEdit = true, restaurantName = 'Restaurante' }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

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
      const payload = { status: 'pending' as const, provider: 'pendente_integracao' };
      const { error } = await supabase.from('fiscal_invoices').update(payload).eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'issue', entity: 'invoice', entityId: id, summary: `Nota fiscal de "${before?.customer_name ?? id}" enviada para emissão`, before, after: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success('Nota marcada para emissão', { description: 'Será transmitida quando o emissor fiscal for integrado.' });
    },
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
          Emissão preparada para integração com emissor fiscal. Enquanto isso, as notas ficam registradas e podem ser impressas como pré-nota.
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
                    {inv.number ? ` · NF ${inv.number}` : ''}
                  </div>
                </div>
                <div className="text-lg font-bold">{brl(Number(inv.total))}</div>
                <Badge variant={inv.status === 'issued' ? 'secondary' : inv.status === 'error' ? 'destructive' : 'outline'}>
                  {statusLabels[inv.status]}
                </Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => printInvoice(inv)}><Printer className="h-4 w-4" /></Button>
                  {canEdit && inv.status === 'draft' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => issue.mutate(inv.id)}>
                      <Send className="h-4 w-4" /> Emitir
                    </Button>
                  )}
                  {canEdit && (
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
