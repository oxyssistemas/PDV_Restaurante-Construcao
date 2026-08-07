import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Loader2, Pencil, Trash2, Bike } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { courierStatusClasses, courierStatusLabels, courierDotClass } from '@/lib/delivery';

interface CourierForm {
  id?: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  email: string;
  password: string;
}

const emptyForm: CourierForm = { name: '', phone: '', vehicle: '', plate: '', email: '', password: '' };

export default function CouriersPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CourierForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: couriers, isLoading } = useQuery({
    queryKey: ['couriers', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('couriers')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome do entregador');

      if (form.id) {
        const { error } = await supabase
          .from('couriers')
          .update({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            vehicle: form.vehicle.trim() || null,
            plate: form.plate.trim().toUpperCase() || null,
          })
          .eq('id', form.id);
        if (error) throw error;
        return;
      }

      let userId: string | null = null;
      if (form.email.trim()) {
        if (form.password.length < 6) throw new Error('A senha de acesso precisa ter ao menos 6 caracteres');
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: form.email.trim(),
            password: form.password,
            role: 'courier',
            restaurant_id: restaurantId,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        userId = (data as any)?.user?.id ?? null;
      }

      const { error } = await supabase.from('couriers').insert({
        restaurant_id: restaurantId!,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        vehicle: form.vehicle.trim() || null,
        plate: form.plate.trim().toUpperCase() || null,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entregador salvo!');
      queryClient.invalidateQueries({ queryKey: ['couriers'] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar entregador.'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('couriers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entregador removido.');
      queryClient.invalidateQueries({ queryKey: ['couriers'] });
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao remover entregador.'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">Entregadores</h1>
          <p className="text-xs text-muted-foreground">Cadastro de motoboys, veículos e acesso ao portal do entregador</p>
        </div>
        <Button className="gap-2" onClick={() => { setForm(emptyForm); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Novo entregador
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !couriers?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <Bike className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p>Nenhum entregador cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {couriers.map(c => (
            <Card key={c.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bike className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', courierStatusClasses(c.status))}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', courierDotClass(c.status))} />
                      {courierStatusLabels[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[c.vehicle, c.plate].filter(Boolean).join(' • ') || 'Sem veículo informado'}
                  </p>
                  {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c.user_id ? 'Acesso ao portal ativo' : 'Sem login de acesso'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => {
                    setForm({
                      id: c.id, name: c.name, phone: c.phone || '', vehicle: c.vehicle || '',
                      plate: c.plate || '', email: '', password: '',
                    });
                    setOpen(true);
                  }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar entregador' : 'Novo entregador'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Moto / veículo</Label>
                <Input placeholder="Honda CG 160" value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Placa</Label>
                <Input placeholder="ABC1D23" value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            {!form.id && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Opcional: crie o login para o entregador acessar o portal de entregas.
                </p>
                <div className="space-y-1.5">
                  <Label>E-mail de acesso</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover entregador?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pedidos já entregues continuam no histórico, mas ficam sem entregador vinculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
