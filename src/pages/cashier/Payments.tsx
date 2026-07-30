import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ReceiptText, Banknote, CreditCard, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { authorLabel } from '@/lib/orders';


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

  // Unpaid orders (all tables)
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

      // Cashier releases the table
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!activeRegister) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ReceiptText className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Caixa não está aberto</p>
        <p className="text-sm">Abra o caixa na página principal para receber pagamentos</p>
      </div>
    );
  }

  const selectedTable = tables?.find(t => t.id === selectedTableId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Caixa — Mesas e Pagamentos</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: consumption + payment */}
        <div className="space-y-4 order-2 lg:order-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {selectedTable ? `Mesa ${selectedTable.number} — Consumo` : 'Selecione uma mesa'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedTable ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Escolha uma mesa ao lado para ver os itens consumidos.
                </p>
              ) : !tableOrders.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma comanda aberta nesta mesa.
                </p>
              ) : (
                <div className="space-y-4">
                  {tableOrders.map((order, idx) => {
                    const orderItems = (items || []).filter(i => i.order_id === order.id);
                    const orderTotal = orderItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
                    return (
                      <div key={order.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm truncate">
                            {order.customer_name || `Comanda ${idx + 1}`}
                          </span>
                          <Badge variant="outline">R$ {orderTotal.toFixed(2)}</Badge>
                        </div>
                        <div className="mb-2 text-[11px] text-muted-foreground">
                          Lançado por {authorLabel(order as any)}
                        </div>

                        {orderItems.length ? (
                          <ul className="space-y-1 text-sm">
                            {orderItems.map(i => (
                              <li key={i.id} className="flex justify-between gap-2">
                                <span className="truncate">{i.quantity}x {(i as any).menu_items?.name}</span>
                                <span className="text-muted-foreground shrink-0">
                                  R$ {(Number(i.unit_price) * i.quantity).toFixed(2)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sem itens.</p>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">Total da mesa</span>
                    <span className="text-2xl font-bold">R$ {total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedTable && tableOrders.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {methods.map(m => (
                    <Button
                      key={m.value}
                      variant={method === m.value ? 'default' : 'outline'}
                      className="justify-start gap-2 h-12"
                      onClick={() => setMethod(m.value)}
                    >
                      <m.icon className="h-4 w-4" /> {m.label}
                    </Button>
                  ))}
                </div>

                {method === 'cash' && (
                  <div>
                    <Label>Valor Recebido (R$)</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={receivedAmount}
                      onChange={e => setReceivedAmount(e.target.value)}
                      placeholder={total.toFixed(2)}
                    />
                    {received > 0 && (
                      <p className="text-sm font-medium mt-1 text-green-600">Troco: R$ {change.toFixed(2)}</p>
                    )}
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  disabled={!method || pay.isPending || (method === 'cash' && received > 0 && received < total)}
                  onClick={() => pay.mutate()}
                >
                  {pay.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar e Liberar Mesa
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: tables map */}
        <div className="order-1 lg:order-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Mesas</CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-500" /> Disponível</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-500" /> Em uso</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-yellow-400" /> Em atendimento</span>
              </div>
            </CardHeader>
            <CardContent>
              {!tables?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mesa cadastrada.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {tables.map(t => {
                    const isSelected = t.id === selectedTableId;
                    const occupied = t.status !== 'free' || (openOrders || []).some(o => o.table_id === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => { setSelectedTableId(t.id); setMethod(''); setReceivedAmount(''); }}
                        className={cn(
                          'rounded-lg border-2 p-3 text-left transition-colors',
                          isSelected
                            ? 'bg-yellow-400/25 border-yellow-500 text-yellow-800'
                            : occupied
                              ? 'bg-red-500/15 border-red-500 text-red-700 hover:bg-red-500/25'
                              : 'bg-green-500/15 border-green-500 text-green-700 hover:bg-green-500/25'
                        )}
                      >
                        <div className="text-lg font-bold">Mesa {t.number}</div>
                        <div className="text-[11px] flex items-center gap-1 opacity-80">
                          <Users className="h-3 w-3" /> {t.capacity}
                        </div>
                        <div className="text-[11px] font-medium mt-1">
                          {isSelected ? 'Em atendimento' : occupied ? 'Em uso' : 'Disponível'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
