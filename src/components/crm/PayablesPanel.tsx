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
import { Loader2, Plus, Pencil, Trash2, CheckCircle2, CalendarClock, AlertTriangle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { brl, downloadCsv } from '@/lib/finance';
import { cn } from '@/lib/utils';

interface Props { restaurantId: string; role?: string | null; canEdit?: boolean }

interface Form {
  id?: string; supplier_id: string; description: string; category: string;
  amount: string; due_date: string; payment_method: string; notes: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const empty: Form = { supplier_id: '', description: '', category: '', amount: '', due_date: today(), payment_method: '', notes: '' };

const statusLabels: Record<string, string> = { open: 'Em aberto', paid: 'Paga', cancelled: 'Cancelada' };

export default function PayablesPanel({ restaurantId, role, canEdit = true }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');

  const { data: suppliers } = useQuery({
    queryKey: ['crm-suppliers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name').eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payables, isLoading } = useQuery({
    queryKey: ['crm-payables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts_payable').select('*').eq('restaurant_id', restaurantId).order('due_date');
      if (error) throw error;
      return data || [];
    },
  });

  const supplierName = (id: string | null) => suppliers?.find(s => s.id === id)?.name || '—';

  const save = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error('Informe a descrição');
      const payload = {
        restaurant_id: restaurantId,
        supplier_id: form.supplier_id || null,
        description: form.description.trim(),
        category: form.category.trim() || null,
        amount: Number(form.amount) || 0,
        due_date: form.due_date,
        payment_method: form.payment_method || null,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const before = (payables || []).find(p => p.id === form.id);
        const { error } = await supabase.from('accounts_payable').update(payload).eq('id', form.id);
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'update', entity: 'payable', entityId: form.id, summary: `Conta "${payload.description}" atualizada (${brl(payload.amount)})`, before, after: payload });
      } else {
        const { data, error } = await supabase.from('accounts_payable').insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'create', entity: 'payable', entityId: data?.id, summary: `Conta "${payload.description}" lançada (${brl(payload.amount)})`, after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-payables'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setOpen(false); setForm(empty);
      toast.success('Conta salva');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'open' | 'paid' | 'cancelled' }) => {
      const before = (payables || []).find(p => p.id === id);
      const payload = { status, paid_at: status === 'paid' ? new Date().toISOString() : null };
      const { error } = await supabase.from('accounts_payable').update(payload).eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'status', entity: 'payable', entityId: id, summary: `Conta "${before?.description ?? id}" marcada como ${statusLabels[status]}`, before, after: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-payables'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success('Situação atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = (payables || []).find(p => p.id === id);
      const { error } = await supabase.from('accounts_payable').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'delete', entity: 'payable', entityId: id, summary: `Conta "${before?.description ?? id}" excluída`, before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-payables'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success('Conta excluída');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOverdue = (p: { status: string; due_date: string }) => p.status === 'open' && p.due_date < today();

  const list = (payables || []).filter(p => {
    if (filter === 'open') return p.status === 'open';
    if (filter === 'paid') return p.status === 'paid';
    if (filter === 'overdue') return isOverdue(p);
    return true;
  });

  const totalOpen = (payables || []).filter(p => p.status === 'open').reduce((s, p) => s + Number(p.amount), 0);
  const totalOverdue = (payables || []).filter(isOverdue).reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = (payables || []).filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);

  const exportCsv = () => {
    downloadCsv('contas-a-pagar.csv', [
      ['Descrição', 'Fornecedor', 'Categoria', 'Vencimento', 'Valor', 'Situação'],
      ...list.map(p => [p.description, supplierName(p.supplier_id), p.category || '', p.due_date, Number(p.amount).toFixed(2), statusLabels[p.status]]),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" /> Em aberto</div>
          <div className="mt-1 text-2xl font-bold">{brl(totalOpen)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-destructive" /> Vencidas</div>
          <div className="mt-1 text-2xl font-bold text-destructive">{brl(totalOverdue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Pagas</div>
          <div className="mt-1 text-2xl font-bold">{brl(totalPaid)}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={v => setFilter(v as 'all' | 'open' | 'overdue' | 'paid')}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="open">Em aberto</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
            <SelectItem value="paid">Pagas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
        <div className="flex-1" />
        {canEdit && (
          <Button className="gap-2" onClick={() => { setForm(empty); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova conta
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhuma conta encontrada.</p>
      ) : (
        <div className="space-y-2">
          {list.map(p => (
            <Card key={p.id} className={cn(isOverdue(p) && 'border-destructive/50')}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-[200px] flex-1">
                  <div className="font-semibold">{p.description}</div>
                  <div className="text-sm text-muted-foreground">
                    {supplierName(p.supplier_id)}{p.category ? ` · ${p.category}` : ''} · vence {new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="text-lg font-bold">{brl(Number(p.amount))}</div>
                <Badge variant={p.status === 'paid' ? 'secondary' : isOverdue(p) ? 'destructive' : 'outline'}>
                  {isOverdue(p) ? 'Vencida' : statusLabels[p.status]}
                </Badge>
                {canEdit && (
                  <div className="flex gap-1">
                    {p.status !== 'paid' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus.mutate({ id: p.id, status: 'paid' })}>
                        <CheckCircle2 className="h-4 w-4" /> Pagar
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => {
                      setForm({
                        id: p.id, supplier_id: p.supplier_id || '', description: p.description,
                        category: p.category || '', amount: String(p.amount), due_date: p.due_date,
                        payment_method: p.payment_method || '', notes: p.notes || '',
                      });
                      setOpen(true);
                    }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Editar conta' : 'Nova conta a pagar'}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1"><Label>Descrição *</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id || 'none'} onValueChange={v => setForm({ ...form, supplier_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {(suppliers || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="space-y-1"><Label>Vencimento *</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Categoria</Label><Input placeholder="Insumos, Aluguel..." value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              <div className="space-y-1"><Label>Forma de pagamento</Label><Input placeholder="Boleto, PIX..." value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} /></div>
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
