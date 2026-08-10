import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Search, Phone, Mail, User } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';

interface Props { restaurantId: string; role?: string | null; canEdit?: boolean }

interface Form {
  id?: string;
  name: string; phone: string; email: string; document: string;
  address: string; birthdate: string; tags: string; notes: string;
}
const empty: Form = { name: '', phone: '', email: '', document: '', address: '', birthdate: '', tags: '', notes: '' };

export default function CustomersPanel({ restaurantId, role, canEdit = true }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const { data: customers, isLoading } = useQuery({
    queryKey: ['crm-customers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers').select('*').eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome do cliente');
      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        document: form.document.trim() || null,
        address: form.address.trim() || null,
        birthdate: form.birthdate || null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const before = (customers || []).find(c => c.id === form.id);
        const { error } = await supabase.from('customers').update(payload).eq('id', form.id);
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'update', entity: 'customer', entityId: form.id, summary: `Cliente "${payload.name}" atualizado`, before, after: payload });
      } else {
        const { data, error } = await supabase.from('customers').insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ restaurantId, role, action: 'create', entity: 'customer', entityId: data?.id, summary: `Cliente "${payload.name}" cadastrado`, after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-customers'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setOpen(false); setForm(empty);
      toast.success('Cliente salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const before = (customers || []).find(c => c.id === id);
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ restaurantId, role, action: 'delete', entity: 'customer', entityId: id, summary: `Cliente "${before?.name ?? id}" excluído`, before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-customers'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      setDeleteId(null);
      toast.success('Cliente excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (customers || []).filter(c =>
    !q || [c.name, c.phone, c.email, c.document].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={() => { setForm(empty); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum cliente cadastrado.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold truncate">
                      <User className="h-4 w-4 text-primary shrink-0" />{c.name}
                    </div>
                    {c.phone && <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}
                    {c.email && <div className="flex items-center gap-2 text-sm text-muted-foreground truncate"><Mail className="h-3.5 w-3.5" />{c.email}</div>}
                    {c.address && <div className="mt-1 text-xs text-muted-foreground">{c.address}</div>}
                    {(c.tags || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(c.tags || []).map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => {
                        setForm({
                          id: c.id, name: c.name, phone: c.phone || '', email: c.email || '',
                          document: c.document || '', address: c.address || '',
                          birthdate: c.birthdate || '', tags: (c.tags || []).join(', '), notes: c.notes || '',
                        });
                        setOpen(true);
                      }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{form.id ? 'Editar cliente' : 'Novo cliente'}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label>CPF/CNPJ</Label><Input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1"><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Aniversário</Label><Input type="date" value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} /></div>
              <div className="space-y-1"><Label>Etiquetas</Label><Input placeholder="VIP, delivery" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></div>
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

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita e ficará registrada no log.</AlertDialogDescription>
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
