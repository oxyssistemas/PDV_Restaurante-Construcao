import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2, Search, Plus, Users, Clock, Receipt, UtensilsCrossed, User2,
  Pencil, Link2, Unlink, Check, X, ChevronRight, CalendarClock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { authorFields } from '@/lib/orders';
import { brl, tableStatusMeta, timeLabel, waiterFilters, TableUiStatus } from '@/lib/waiter';
import { activeReservationFor, hhmm, sameHolder, todayISO, upcomingReservationFor } from '@/lib/reservations';

export default function TableMap() {
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | TableUiStatus>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [newTableId, setNewTableId] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const { data: tables, isLoading } = useQuery({
    queryKey: ['waiter-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables').select('*').eq('restaurant_id', restaurantId!).order('number');
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ['table-orders', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, total, status, created_at, customer_name, created_by_name')
        .eq('restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const orderIds = (orders || []).map(o => o.id);

  const { data: items } = useQuery({
    queryKey: ['table-order-items', orderIds.join(',')],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items').select('id, order_id, quantity, status').in('order_id', orderIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: reservations } = useQuery({
    queryKey: ['table-reservations', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('reservations')
        .select('id, table_id, customer_name, reservation_date, start_time, end_time, status')
        .eq('restaurant_id', restaurantId!)
        .eq('reservation_date', todayISO())
        .eq('status', 'confirmed');
      return data || [];
    },
  });

  const { data: alerts } = useQuery({
    queryKey: ['waiter-table-alerts', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, message, read, created_at')
        .eq('restaurant_id', restaurantId!)
        .in('type', ['bill_request', 'manager_call'])
        .eq('read', false);
      return data || [];
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('waiter-tables-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['waiter-tables', restaurantId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['table-orders', restaurantId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' },
        () => queryClient.invalidateQueries({ queryKey: ['table-order-items'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['table-reservations', restaurantId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['waiter-table-alerts', restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const cards = useMemo(() => {
    return (tables || []).map(table => {
      const group = (table as any).merge_group_id as string | null;
      const groupTables = group ? (tables || []).filter(t => (t as any).merge_group_id === group) : [table];
      const groupIds = groupTables.map(t => t.id);
      const tableOrders = (orders || []).filter(o => o.table_id && groupIds.includes(o.table_id));
      const tableItems = (items || []).filter(i => tableOrders.some(o => o.id === i.order_id));
      const totals = tableOrders.reduce((s, o) => s + Number(o.total), 0);
      const itemCount = tableItems.reduce((s, i) => s + i.quantity, 0);
      const openedAt = tableOrders[0]?.created_at ?? null;
      const calling = (alerts || []).some(a => (a.message || '').includes(`Mesa ${table.number} `));
      const capacity = groupTables.reduce((s, t) => s + t.capacity, 0);

      let status: TableUiStatus = 'free';
      if (calling) status = 'calling';
      else if (tableItems.some(i => i.status === 'ready')) status = 'ready';
      else if (tableItems.some(i => i.status === 'pending' || i.status === 'preparing')) status = 'sent';
      else if (tableOrders.length || table.status !== 'free') status = 'occupied';

      const reservation = activeReservationFor(table.id, reservations as any);
      const nextReservation = upcomingReservationFor(table.id, reservations as any);
      if (status === 'free' && reservation) status = 'reserved';

      return { table, tableOrders, totals, itemCount, openedAt, status, group, groupTables, capacity, reservation, nextReservation };
    });
  }, [tables, orders, items, alerts, reservations]);

  const visible = cards.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(c.table.number).includes(q) ||
      c.tableOrders.some(o => (o.customer_name || '').toLowerCase().includes(q));
  });

  const openOrder = useMutation({
    mutationFn: async ({ tableId, customer }: { tableId: string; customer?: string }) => {
      const table = tables?.find(t => t.id === tableId);
      if (table?.status === 'free') {
        await supabase.from('restaurant_tables').update({ status: 'occupied' as const }).eq('id', tableId);
      }
      const reservation = activeReservationFor(tableId, reservations as any);
      if (reservation && !sameHolder(customer, reservation.customer_name)) {
        throw new Error(
          `Mesa reservada para ${reservation.customer_name} (${hhmm(reservation.start_time)} - ${hhmm(reservation.end_time)}). Somente o titular da reserva pode ocupar esta mesa.`
        );
      }
      const { data, error } = await supabase.from('orders').insert({
        table_id: tableId,
        reservation_id: reservation?.id ?? null,
        restaurant_id: restaurantId!,
        waiter_id: user!.id,
        status: 'pending' as const,
        order_type: 'dine_in',
        customer_name: customer?.trim() || null,
        ...authorFields(user, currentRole?.role),
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (order) => {
      setNewOpen(false); setNewCustomer(''); setNewTableId('');
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      navigate(`/waiter/orders/${order.id}`);
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível abrir a comanda.'),
  });

  const renameOrder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('orders').update({ customer_name: name.trim() || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRenaming(null);
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success('Comanda renomeada!');
    },
    onError: () => toast.error('Não foi possível renomear a comanda.'),
  });

  const mergeTables = useMutation({
    mutationFn: async (ids: string[]) => {
      const existing = (tables || []).find(t => ids.includes(t.id) && (t as any).merge_group_id);
      const groupId = (existing as any)?.merge_group_id || crypto.randomUUID();
      const { error } = await supabase.from('restaurant_tables')
        .update({ merge_group_id: groupId } as any).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setMergeMode(false); setSelected([]);
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      toast.success('Mesas unidas!');
    },
    onError: () => toast.error('Não foi possível unir as mesas.'),
  });

  const splitTables = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('restaurant_tables')
        .update({ merge_group_id: null } as any).eq('merge_group_id', groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      toast.success('Mesas separadas!');
    },
    onError: () => toast.error('Não foi possível separar as mesas.'),
  });

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCard = (c: (typeof cards)[number]) => {
    if (mergeMode) return toggleSelect(c.table.id);
    if (c.tableOrders.length === 1) return navigate(`/waiter/orders/${c.tableOrders[0].id}`);
    if (c.tableOrders.length > 1) return navigate(`/waiter/orders?table=${c.table.id}`);
    if (c.reservation) {
      setNewTableId(c.table.id);
      setNewCustomer(c.reservation.customer_name);
      setNewOpen(true);
      return;
    }
    openOrder.mutate({ tableId: c.table.id });
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">Oxys PDV</h1>
          <p className="text-xs text-muted-foreground">Atendimento • Salão</p>
        </div>
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-12 rounded-2xl pl-9"
            placeholder="Buscar mesa ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={mergeMode ? 'default' : 'outline'}
          className="h-12 gap-2 rounded-2xl px-5"
          onClick={() => { setMergeMode(m => !m); setSelected([]); }}
        >
          <Link2 className="h-5 w-5" /> {mergeMode ? 'Cancelar união' : 'Unir mesas'}
        </Button>
        <Button className="h-12 gap-2 rounded-2xl px-5 text-base" onClick={() => setNewOpen(true)}>
          <Plus className="h-5 w-5" /> Nova Mesa
        </Button>
      </div>

      {mergeMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <span className="text-sm text-muted-foreground">
            Selecione 2 ou mais mesas para unir. {selected.length} selecionada(s).
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="gap-2 rounded-xl" onClick={() => { setMergeMode(false); setSelected([]); }}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button className="gap-2 rounded-xl" disabled={selected.length < 2 || mergeTables.isPending}
              onClick={() => mergeTables.mutate(selected)}>
              {mergeTables.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Unir mesas
            </Button>
          </div>
        </div>
      )}

      <div className="pdv-scroll flex gap-2 overflow-x-auto pb-1">
        {waiterFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'pdv-ripple shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all',
              filter === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map(c => {
          const meta = tableStatusMeta[c.status];
          const isSelected = selected.includes(c.table.id);
          const others = c.groupTables.filter(t => t.id !== c.table.id).map(t => t.number);
          return (
            <motion.div
              key={c.table.id}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleCard(c)}
              role="button"
              className={cn(
                'pdv-card pdv-card-hover pdv-ripple cursor-pointer border-2 p-5 text-left',
                meta.card,
                mergeMode && isSelected && 'border-primary ring-2 ring-primary/40'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-4xl font-bold leading-none">{c.table.number}</div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">
                    {c.tableOrders.length > 1
                      ? `${c.tableOrders.length} comandas`
                      : c.tableOrders[0]?.customer_name || (c.tableOrders.length ? 'Sem cliente' : 'Mesa livre')}
                  </div>
                </div>
                <span className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', meta.chip)}>
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {meta.label}
                </span>
              </div>

              {!!others.length && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  <Link2 className="h-3.5 w-3.5" /> Unida com mesa{others.length > 1 ? 's' : ''} {others.join(', ')}
                </div>
              )}

              {(c.reservation || c.nextReservation) && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {c.reservation
                      ? `Reservada para ${c.reservation.customer_name} até ${hhmm(c.reservation.end_time)}`
                      : `Reserva às ${hhmm(c.nextReservation!.start_time)} • ${c.nextReservation!.customer_name}`}
                  </span>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" /> {c.capacity} pessoas
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" /> {c.openedAt ? timeLabel(c.openedAt) : '--:--'}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UtensilsCrossed className="h-4 w-4" /> {c.itemCount} itens
                </div>
                <div className="flex items-center gap-2 truncate text-muted-foreground">
                  <User2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.tableOrders[0]?.created_by_name?.split('@')[0] || '—'}</span>
                </div>
              </div>

              {!!c.tableOrders.length && (
                <div className="mt-4 space-y-1 border-t border-border pt-3">
                  {c.tableOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/40">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        onClick={e => { e.stopPropagation(); navigate(`/waiter/orders/${o.id}`); }}
                      >
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{o.customer_name || 'Comanda sem nome'}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{brl(Number(o.total))}</span>
                      </button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={e => { e.stopPropagation(); setRenaming({ id: o.id, name: o.customer_name || '' }); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Receipt className="h-4 w-4" /> Parcial
                </span>
                <span className="text-xl font-bold text-primary">{brl(c.totals)}</span>
              </div>

              {!mergeMode && (
                <div className="mt-3 flex gap-2">
                  <Button
                    className="h-11 flex-1 gap-2 rounded-xl"
                    variant={c.tableOrders.length ? 'outline' : 'default'}
                    disabled={openOrder.isPending}
                    onClick={e => {
                      e.stopPropagation();
                      setNewTableId(c.table.id);
                      setNewCustomer(c.reservation?.customer_name || '');
                      setNewOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {c.tableOrders.length ? 'Nova comanda' : 'Criar comanda'}
                  </Button>
                  {c.group && (
                    <Button
                      variant="outline" className="h-11 gap-2 rounded-xl"
                      onClick={e => { e.stopPropagation(); splitTables.mutate(c.group!); }}
                    >
                      <Unlink className="h-4 w-4" /> Separar
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {!visible.length && (
        <p className="py-12 text-center text-muted-foreground">Nenhuma mesa encontrada com esse filtro.</p>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Abrir nova comanda</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mesa</Label>
              <Select value={newTableId} onValueChange={setNewTableId}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecione a mesa" /></SelectTrigger>
                <SelectContent>
                  {tables?.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      Mesa {t.number} • {t.capacity} lugares
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const res = activeReservationFor(newTableId, reservations as any);
              if (!res) return null;
              return (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-400">
                  Mesa reservada para <strong>{res.customer_name}</strong> ({hhmm(res.start_time)} - {hhmm(res.end_time)}).
                  Informe o nome do titular para liberar a abertura da comanda.
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da comanda (opcional)</Label>
              <Input className="h-12 rounded-xl" placeholder="Ex.: João / Conta 1" value={newCustomer} onChange={e => setNewCustomer(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button
              className="rounded-xl"
              disabled={!newTableId || openOrder.isPending}
              onClick={() => openOrder.mutate({ tableId: newTableId, customer: newCustomer })}
            >
              {openOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Abrir comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={o => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Renomear comanda</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da comanda</Label>
            <Input
              className="h-12 rounded-xl"
              placeholder="Ex.: Maria / Conta 2"
              value={renaming?.name || ''}
              onChange={e => setRenaming(r => r && { ...r, name: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button
              className="rounded-xl"
              disabled={renameOrder.isPending}
              onClick={() => renaming && renameOrder.mutate(renaming)}
            >
              {renameOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
