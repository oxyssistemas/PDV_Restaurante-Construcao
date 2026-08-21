import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Plus, Play, Ban, CheckCheck, UserX, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authorFields } from '@/lib/orders';
import { activeReservationFor, hhmm, reservationStatusLabels, todayISO } from '@/lib/reservations';

export default function WaiterReservations() {
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [date, setDate] = useState(todayISO());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    table_id: '',
    customer_name: '',
    customer_phone: '',
    start_time: '19:00',
    end_time: '21:00',
    party_size: '2',
    notes: '',
  });

  const { data: tables } = useQuery({
    queryKey: ['reservation-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('restaurant_tables').select('id, number, capacity')
        .eq('restaurant_id', restaurantId!).order('number');
      return data || [];
    },
  });

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['waiter-reservations', restaurantId, date],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('reservations')
        .select('*, restaurant_tables(number)')
        .eq('restaurant_id', restaurantId!)
        .eq('reservation_date', date)
        .order('start_time');
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.table_id || !form.customer_name.trim()) throw new Error('Informe a mesa e o nome do cliente.');
      if (form.end_time <= form.start_time) throw new Error('O horário final deve ser maior que o inicial.');
      const conflict = (reservations || []).some(
        (r: any) =>
          r.table_id === form.table_id &&
          r.status === 'confirmed' &&
          form.start_time < r.end_time.slice(0, 5) &&
          form.end_time > r.start_time.slice(0, 5)
      );
      if (conflict) throw new Error('Já existe uma reserva confirmada para esta mesa nesse horário.');
      const { error } = await supabase.from('reservations').insert({
        restaurant_id: restaurantId!,
        table_id: form.table_id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        reservation_date: date,
        start_time: form.start_time,
        end_time: form.end_time,
        party_size: Number(form.party_size) || 1,
        notes: form.notes.trim() || null,
        status: 'confirmed' as const,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm(f => ({ ...f, table_id: '', customer_name: '', customer_phone: '', notes: '' }));
      queryClient.invalidateQueries({ queryKey: ['waiter-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['table-reservations'] });
      toast.success('Reserva criada!');
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível criar a reserva.'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'cancelled' | 'completed' | 'no_show' }) => {
      const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['table-reservations'] });
      toast.success('Reserva atualizada.');
    },
    onError: () => toast.error('Não foi possível atualizar a reserva.'),
  });

  /** Abre a comanda já vinculada à reserva (única forma de ocupar uma mesa reservada). */
  const startService = useMutation({
    mutationFn: async (r: any) => {
      await supabase.from('restaurant_tables').update({ status: 'occupied' as const }).eq('id', r.table_id);
      const { data, error } = await supabase.from('orders').insert({
        restaurant_id: restaurantId!,
        table_id: r.table_id,
        reservation_id: r.id,
        waiter_id: user!.id,
        status: 'pending' as const,
        order_type: 'dine_in',
        customer_name: r.customer_name,
        ...authorFields(user, currentRole?.role),
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: order => {
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      navigate(`/waiter/orders/${order.id}`);
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível iniciar o atendimento.'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="text-xs text-muted-foreground">Mesas reservadas ficam bloqueadas para outros clientes</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Data</Label>
          <Input type="date" className="h-12 w-44 rounded-xl" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <Button className="h-12 gap-2 rounded-2xl px-5" onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" /> Nova reserva
        </Button>
      </div>

      {reservations && reservations.length > 0 ? (
        <div className="space-y-3">
          {reservations.map((r: any) => {
            const active = !!activeReservationFor(r.table_id, [r] as any);
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {r.customer_name}
                      {active && r.status === 'confirmed' && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-400">
                          <Lock className="h-3 w-3" /> Mesa bloqueada
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Mesa {r.restaurant_tables?.number} • {hhmm(r.start_time)} - {hhmm(r.end_time)} • {r.party_size} pessoas
                      {r.customer_phone ? ` • ${r.customer_phone}` : ''}
                    </div>
                    {r.notes && <div className="mt-1 text-xs italic text-muted-foreground">{r.notes}</div>}
                  </div>
                  <Badge variant={r.status === 'confirmed' ? 'default' : 'secondary'}>
                    {reservationStatusLabels[r.status]}
                  </Badge>
                  {r.status === 'confirmed' && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="gap-2 rounded-xl" disabled={startService.isPending}
                        onClick={() => startService.mutate(r)}>
                        <Play className="h-4 w-4" /> Iniciar atendimento
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2 rounded-xl"
                        onClick={() => setStatus.mutate({ id: r.id, status: 'completed' })}>
                        <CheckCheck className="h-4 w-4" /> Concluir
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2 rounded-xl"
                        onClick={() => setStatus.mutate({ id: r.id, status: 'no_show' })}>
                        <UserX className="h-4 w-4" /> Não veio
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-2 rounded-xl text-destructive"
                        onClick={() => setStatus.mutate({ id: r.id, status: 'cancelled' })}>
                        <Ban className="h-4 w-4" /> Cancelar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <CalendarDays className="mb-3 h-12 w-12 opacity-30" />
          Nenhuma reserva para esta data.
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova reserva</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mesa *</Label>
              <Select value={form.table_id} onValueChange={v => setForm(f => ({ ...f, table_id: v }))}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecione a mesa" /></SelectTrigger>
                <SelectContent>
                  {(tables || []).map(t => (
                    <SelectItem key={t.id} value={t.id}>Mesa {t.number} • {t.capacity} lugares</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente *</Label>
              <Input className="h-12 rounded-xl" value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Nome do titular" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input className="h-12 rounded-xl" value={form.customer_phone}
                onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="time" className="h-12 rounded-xl" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="time" className="h-12 rounded-xl" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pessoas</Label>
                <Input type="number" min="1" className="h-12 rounded-xl" value={form.party_size}
                  onChange={e => setForm(f => ({ ...f, party_size: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Aniversário, cadeirinha, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
