import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Search, Truck, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';

interface Props { restaurantId: string; role?: string | null; canEdit?: boolean }

interface Form {
  id?: string; name: string; document: string; contact_name: string;
  phone: string; email: string; address: string; category: string; notes: string;
}
const empty: Form = { name: '', document: '', contact_name: '', phone: '', email: '', address: '', category: '', notes: '' };

export default function SuppliersPanel({ restaurantId, role, canEdit = true }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['crm-suppliers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers').select('*').eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome do fornecedor');
      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        document: form.document.trim() || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const before = (suppliers || []).find(s => s.id === form.id);
        const { error } = await supabase.from('suppliers').update(payload).eq('id', form.id);
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'update', entity: 'supplier', entityId: form.id, summary: `Fornecedor "${payload.name}" atualizado`, before, after: payload });
      } else {
        const { data, error } = await supabase.from('suppliers').insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'create', entity: 'supplier', entityId: data?.id, summary: `Fornecedor "${payload.name}" cadastrado`, after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-suppliers'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setOpen(false); setForm(empty);
      toast.success('Fornecedor salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = (suppliers || []).find(s => s.id === id);
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'delete', entity: 'supplier', entityId: id, summary: `Fornecedor "${before?.name ?? id}" excluído`, before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-suppliers'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setDeleteId(null);
      toast.success('Fornecedor excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (suppliers || []).filter(s =>
    !q || [s.name, s.document, s.category, s.contact_name].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar fornecedor..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={() => { setForm(empty); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo fornecedor
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum fornecedor cadastrado.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold truncate">
                      <Truck className="h-4 w-4 text-primary shrink-0" />{s.name}
                    </div>
                    {s.category && <div className="text-xs text-muted-foreground">{s.category}</div>}
                    {s.document && <div className="mt-1 text-sm text-muted-foreground">Doc: {s.document}</div>}
                    {s.contact_name && <div className="text-sm text-muted-foreground">Contato: {s.contact_name}</div>}
                    {s.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{s.phone}</div>}
                    {s.email && <div className="flex items-center gap-2 text-sm text-muted-foreground truncate"><Mail className="h-3.5 w-3.5" />{s.email}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => {
                        setForm({
                          id: s.id, name: s.name, document: s.document || '', contact_name: s.contact_name || '',
                          phone: s.phone || '', email: s.email || '', address: s.address || '',
                          category: s.category || '', notes: s.notes || '',
                        });
                        setOpen(true);
                      }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CNPJ/CPF</Label><Input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} /></div>
              <div className="space-y-1"><Label>Categoria</Label><Input placeholder="Bebidas, Carnes..." value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Contato</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1"><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
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

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>As contas a pagar vinculadas permanecerão, sem fornecedor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
