import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, ReceiptText, Banknote, CreditCard, Smartphone, Users, Search, MoreHorizontal, Wallet, Bike, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { authorLabel } from '@/lib/orders';
import { printReceipt } from '@/lib/printing';
import { logAudit } from '@/lib/audit';
import DeliverySaleDialog from '@/components/delivery/DeliverySaleDialog';

const methods = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote },
  { value: 'credit_card', label: 'Crédito', icon: CreditCard },
  { value: 'debit_card', label: 'Débito', icon: CreditCard },
  { value: 'pix', label: 'PIX', icon: Smartphone },
];

export default function Payments() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [method, setMethod] = useState<string>('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [search, setSearch] = useState('');
  const [deliverySaleOpen, setDeliverySaleOpen] = useState(false);

  const { data: restaurant } = useQuery({
    queryKey: ['restaurant-name', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('restaurants').select('name').eq('id', restaurantId!).maybeSingle();
      return data;
    },
  });


  const { data: activeRegister } = useQuery({
    queryKey: ['cash-register-active', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: tables, isLoading } = useQuery({
    queryKey: ['cashier-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('number');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: openOrders } = useQuery({
    queryKey: ['cashier-open-orders', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, total, status, customer_name, created_at, created_by_name, created_by_role')
        .eq('restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing', 'ready', 'delivered'])
        .order('created_at');
      if (error) throw error;
      const ids = (data || []).map(o => o.id);
      if (!ids.length) return [];
      const { data: paid } = await supabase.from('payments').select('order_id').in('order_id', ids);
      const paidIds = new Set((paid || []).map(p => p.order_id));
      return (data || []).filter(o => !paidIds.has(o.id));
    },
  });

  const tableOrders = (openOrders || []).filter(o => o.table_id === selectedTableId);
  const orderIds = tableOrders.map(o => o.id);

  const { data: items } = useQuery({
    queryKey: ['cashier-table-items', orderIds.join(',')],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, order_id, quantity, unit_price, status, menu_items(name)')
        .in('order_id', orderIds);
      if (error) throw error;
      return (data || []).filter(i => i.status !== 'cancelled');
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('cashier-tables-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cashier-tables', restaurantId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cashier-open-orders', restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient]);

  const total = (items || []).reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  const received = parseFloat(receivedAmount) || 0;
  const change = method === 'cash' ? Math.max(0, received - total) : 0;

  const pay = useMutation({
    mutationFn: async () => {
      if (!selectedTableId || !method || !tableOrders.length) throw new Error('Dados incompletos');

      let remainingChange = method === 'cash' ? change : 0;
      for (const order of tableOrders) {
        const orderTotal = (items || [])
          .filter(i => i.order_id === order.id)
          .reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
        const { error } = await supabase.from('payments').insert({
          order_id: order.id,
          restaurant_id: restaurantId!,
          cash_register_id: activeRegister?.id || null,
          method: method as any,
          amount: orderTotal,
          change_amount: remainingChange,
          user_id: user!.id,
        });
        if (error) throw error;
        remainingChange = 0;
        await supabase.from('orders').update({ status: 'delivered' as any, total: orderTotal }).eq('id', order.id);
      }

      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ status: 'free' as const })
        .eq('id', selectedTableId);
      if (tableError) throw tableError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-tables'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-today-payments'] });
      toast.success('Pagamento registrado! Mesa liberada.');
      setSelectedTableId(null);
      setMethod('');
      setReceivedAmount('');
    },
    onError: () => toast.error('Erro ao processar pagamento.'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        if (method && tableOrders.length && !pay.isPending) pay.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!activeRegister) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <ReceiptText className="mb-4 h-16 w-16 opacity-30" />
        <p className="text-lg font-semibold text-foreground">Caixa não está aberto</p>
        <p className="text-sm">Abra o caixa na página principal para receber pagamentos</p>
      </div>
    );
  }

  const selectedTable = tables?.find(t => t.id === selectedTableId);
  const visibleTables = (tables || []).filter(t => String(t.number).includes(search.trim()));

  const handlePrintReceipt = (width: '58mm' | '80mm' = '80mm') => {
    if (!tableOrders.length) return;
    const first = tableOrders[0] as any;
    printReceipt({
      restaurantName: restaurant?.name || 'Oxys Restaurante',
      width,
      order: {
        id: first.id,
        created_at: first.created_at,
        customer_name: tableOrders.map((o: any, i) => o.customer_name || `Comanda ${i + 1}`).join(' / '),
        table_number: selectedTable?.number ?? null,
        total,
        created_by_name: first.created_by_name,
        created_by_role: first.created_by_role,
      },
      items: (items || []).map(i => ({
        name: (i as any).menu_items?.name || 'Item',
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
      })),
      payments: method ? [{ method, amount: total }] : [],
      change,
    });
    logAudit({
      restaurantId: restaurantId!,
      role: currentRole?.role,
      action: 'print',
      entity: 'payment',
      entityId: first.id,
      summary: `Recibo impresso • Mesa ${selectedTable?.number ?? '-'} • R$ ${total.toFixed(2)}`,
    });
  };

  const paymentPanel = (
    <div className="flex h-full flex-col gap-4">
      <div className="pdv-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {selectedTable ? `Mesa ${selectedTable.number}` : 'Selecione a mesa'}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedTable ? `${selectedTable.capacity} pessoas • ${tableOrders.length} comanda(s)` : 'Nenhuma mesa selecionada'}
            </div>
          </div>
          <Wallet className="h-5 w-5 text-primary" />
        </div>
      </div>

      <div className="pdv-card pdv-scroll min-h-[160px] flex-1 overflow-y-auto p-3">
        {!selectedTable ? (
          <div className="flex h-full min-h-[140px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Escolha uma mesa ao lado para ver o consumo.
          </div>
        ) : !tableOrders.length ? (
          <div className="flex h-full min-h-[140px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Nenhuma comanda aberta nesta mesa.
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {tableOrders.map((order, idx) => {
                const orderItems = (items || []).filter(i => i.order_id === order.id);
                const orderTotal = orderItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-border bg-muted/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {order.customer_name || `Comanda ${idx + 1}`}
                      </span>
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        R$ {orderTotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      Lançado por {authorLabel(order as any)}
                    </div>
                    {orderItems.length ? (
                      <ul className="space-y-1 text-sm">
                        {orderItems.map(i => (
                          <li key={i.id} className="flex justify-between gap-2">
                            <span className="truncate">{i.quantity}x {(i as any).menu_items?.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              R$ {(Number(i.unit_price) * i.quantity).toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem itens.</p>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="pdv-card space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>R$ {total.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Taxa</span><span>R$ 0,00</span></div>
        </div>

        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-3xl font-bold text-primary">R$ {total.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {methods.map(m => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                'pdv-ripple flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200',
                method === m.value
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <m.icon className="h-4 w-4" /> {m.label}
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Valor recebido (R$)</Label>
            <Input
              type="number" min="0" step="0.01"
              className="rounded-xl"
              value={receivedAmount}
              onChange={e => setReceivedAmount(e.target.value)}
              placeholder={total.toFixed(2)}
            />
            {received > 0 && (
              <p className="text-sm font-semibold text-[hsl(var(--success))]">Troco: R$ {change.toFixed(2)}</p>
            )}
          </div>
        )}

        <Button
          className="pdv-ripple h-14 w-full gap-2 rounded-2xl text-base font-semibold"
          disabled={!method || !tableOrders.length || pay.isPending || (method === 'cash' && received > 0 && received < total)}
          onClick={() => pay.mutate()}
        >
          {pay.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
          Finalizar pagamento
          <span className="ml-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">F4</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] gap-4 p-4 md:-m-6 md:h-[calc(100%+3rem)] md:p-6">
      <div className="pdv-scroll flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
            <p className="text-xs text-muted-foreground">PDV • Recebimento e liberação de mesas</p>
          </div>
          <div className="relative min-w-[200px] flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-2xl pl-9"
              placeholder="Buscar mesa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button className="h-11 gap-2 rounded-2xl" onClick={() => setDeliverySaleOpen(true)}>
            <Bike className="h-4 w-4" /> Cliente delivery
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl" onClick={() => toast.info('Mais opções em breve')}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--success))]" /> Disponível</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> Em uso</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Em atendimento</span>
        </div>

        {!visibleTables.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma mesa encontrada.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleTables.map(t => {
              const isSelected = t.id === selectedTableId;
              const occupied = t.status !== 'free' || (openOrders || []).some(o => o.table_id === t.id);
              return (
                <motion.button
                  key={t.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedTableId(t.id); setMethod(''); setReceivedAmount(''); }}
                  className={cn(
                    'pdv-card pdv-card-hover pdv-ripple border p-4 text-left transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : occupied
                        ? 'border-destructive/50 bg-destructive/10'
                        : 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10'
                  )}
                >
                  <div className="text-lg font-bold">Mesa {t.number}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" /> {t.capacity} lugares
                  </div>
                  <div className={cn(
                    'mt-2 text-[11px] font-semibold',
                    isSelected ? 'text-primary' : occupied ? 'text-destructive' : 'text-[hsl(var(--success))]'
                  )}>
                    {isSelected ? 'Em atendimento' : occupied ? 'Em uso' : 'Disponível'}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        <div className="xl:hidden">{paymentPanel}</div>
      </div>

      <aside className="hidden w-[430px] shrink-0 xl:block">{paymentPanel}</aside>

      {restaurantId && (
        <DeliverySaleDialog
          open={deliverySaleOpen}
          onOpenChange={setDeliverySaleOpen}
          restaurantId={restaurantId}
          cashRegisterId={activeRegister?.id}
        />
      )}


    </div>
  );
}
