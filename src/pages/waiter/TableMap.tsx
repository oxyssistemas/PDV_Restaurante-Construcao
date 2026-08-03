import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2, Search, Plus, Users, Clock, Receipt, UtensilsCrossed, User2,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['waiter-table-alerts', restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const cards = useMemo(() => {
    return (tables || []).map(table => {
      const tableOrders = (orders || []).filter(o => o.table_id === table.id);
      const tableItems = (items || []).filter(i => tableOrders.some(o => o.id === i.order_id));
      const totals = tableOrders.reduce((s, o) => s + Number(o.total), 0);
      const itemCount = tableItems.reduce((s, i) => s + i.quantity, 0);
      const openedAt = tableOrders[0]?.created_at ?? null;
      const calling = (alerts || []).some(a => (a.message || '').includes(`Mesa ${table.number} `));

      let status: TableUiStatus = 'free';
      if (calling) status = 'calling';
      else if (tableItems.some(i => i.status === 'ready')) status = 'ready';
      else if (tableItems.some(i => i.status === 'pending' || i.status === 'preparing')) status = 'sent';
      else if (tableOrders.length || table.status !== 'free') status = 'occupied';

      return { table, tableOrders, totals, itemCount, openedAt, status };
    });
  }, [tables, orders, items, alerts]);

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
      const { data, error } = await supabase.from('orders').insert({
        table_id: tableId,
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
    onError: () => toast.error('Não foi possível abrir a comanda.'),
  });

  const handleCard = (c: (typeof cards)[number]) => {
    if (c.tableOrders.length === 1) return navigate(`/waiter/orders/${c.tableOrders[0].id}`);
    if (c.tableOrders.length > 1) return navigate(`/waiter/orders?table=${c.table.id}`);
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
        <Button className="h-12 gap-2 rounded-2xl px-5 text-base" onClick={() => setNewOpen(true)}>
          <Plus className="h-5 w-5" /> Nova Mesa
        </Button>
      </div>

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
          const main = c.tableOrders[0];
          return (
            <motion.button
              key={c.table.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCard(c)}
              className={cn('pdv-card pdv-card-hover pdv-ripple border-2 p-5 text-left', meta.card)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-4xl font-bold leading-none">{c.table.number}</div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">
                    {main?.customer_name || (c.tableOrders.length > 1 ? `${c.tableOrders.length} comandas` : 'Sem cliente')}
                  </div>
                </div>
                <span className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', meta.chip)}>
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {meta.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" /> {c.table.capacity} pessoas
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" /> {c.openedAt ? timeLabel(c.openedAt) : '--:--'}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UtensilsCrossed className="h-4 w-4" /> {c.itemCount} itens
                </div>
                <div className="flex items-center gap-2 truncate text-muted-foreground">
                  <User2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{main?.created_by_name?.split('@')[0] || '—'}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Receipt className="h-4 w-4" /> Parcial
                </span>
                <span className="text-xl font-bold text-primary">{brl(c.totals)}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {!visible.length && (
        <p className="py-12 text-center text-muted-foreground">Nenhuma mesa encontrada com esse filtro.</p>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Abrir nova mesa</DialogTitle></DialogHeader>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente (opcional)</Label>
              <Input className="h-12 rounded-xl" placeholder="Ex.: João" value={newCustomer} onChange={e => setNewCustomer(e.target.value)} />
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
    </div>
  );
}
