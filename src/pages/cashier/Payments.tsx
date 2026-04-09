import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CreditCard, Banknote, Smartphone, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão Crédito',
  debit_card: 'Cartão Débito',
  pix: 'PIX',
};

const methodIcons: Record<string, typeof Banknote> = {
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
  pix: Smartphone,
};

export default function Payments() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [payDialog, setPayDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
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

  const { data: pendingOrders, isLoading } = useQuery({
    queryKey: ['cashier-pending-orders', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant_tables(number)')
        .eq('restaurant_id', restaurantId!)
        .in('status', ['pending', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Filter out already paid orders
      const orderIds = data?.map(o => o.id) || [];
      if (orderIds.length === 0) return [];

      const { data: paidPayments } = await supabase
        .from('payments')
        .select('order_id')
        .in('order_id', orderIds);

      const paidOrderIds = new Set(paidPayments?.map(p => p.order_id));
      return data?.filter(o => !paidOrderIds.has(o.id)) || [];
    },
  });

  const { data: recentPayments } = useQuery({
    queryKey: ['cashier-recent-payments', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, orders(restaurant_tables(number))')
        .eq('restaurant_id', restaurantId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const processPayment = useMutation({
    mutationFn: async () => {
      if (!selectedOrder || !method) throw new Error('Dados incompletos');

      const amount = Number(selectedOrder.total);
      const received = method === 'cash' ? parseFloat(receivedAmount) || amount : amount;
      const changeAmount = method === 'cash' ? Math.max(0, received - amount) : 0;

      const { error } = await supabase.from('payments').insert({
        order_id: selectedOrder.id,
        restaurant_id: restaurantId!,
        cash_register_id: activeRegister?.id || null,
        method: method as any,
        amount,
        change_amount: changeAmount,
        user_id: user!.id,
      });
      if (error) throw error;

      // Mark order as delivered
      await supabase.from('orders').update({ status: 'delivered' as any }).eq('id', selectedOrder.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-recent-payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-active'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-today-payments'] });
      toast.success('Pagamento registrado!');
      setPayDialog(false);
      setSelectedOrder(null);
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

  const orderTotal = selectedOrder ? Number(selectedOrder.total) : 0;
  const received = parseFloat(receivedAmount) || 0;
  const change = method === 'cash' ? Math.max(0, received - orderTotal) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Receber Pagamentos</h1>

      {/* Pending orders */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Pedidos Aguardando Pagamento</CardTitle></CardHeader>
        <CardContent>
          {!pendingOrders?.length ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum pedido pendente</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingOrders.map(order => (
                <Card key={order.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => { setSelectedOrder(order); setPayDialog(true); }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Mesa {(order as any).restaurant_tables?.number || '?'}</span>
                      <Badge variant="outline">{order.status}</Badge>
                    </div>
                    <div className="text-2xl font-bold mt-2">R$ {Number(order.total).toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(order.created_at), "HH:mm", { locale: ptBR })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber Pagamento — Mesa {(selectedOrder as any)?.restaurant_tables?.number || '?'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">Total do Pedido</p>
              <p className="text-3xl font-bold">R$ {orderTotal.toFixed(2)}</p>
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Dinheiro</SelectItem>
                  <SelectItem value="credit_card">💳 Cartão Crédito</SelectItem>
                  <SelectItem value="debit_card">💳 Cartão Débito</SelectItem>
                  <SelectItem value="pix">📱 PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === 'cash' && (
              <div>
                <Label>Valor Recebido (R$)</Label>
                <Input type="number" min="0" step="0.01" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder={orderTotal.toFixed(2)} />
                {received > 0 && (
                  <p className="text-sm font-medium mt-1 text-green-600">Troco: R$ {change.toFixed(2)}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => processPayment.mutate()}
              disabled={!method || processPayment.isPending || (method === 'cash' && received > 0 && received < orderTotal)}
              className="w-full"
              size="lg"
            >
              {processPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent Payments */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Pagamentos Recentes</CardTitle></CardHeader>
        <CardContent>
          {!recentPayments?.length ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum pagamento registrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Troco</TableHead>
                  <TableHead>Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map(p => {
                  const Icon = methodIcons[p.method] || Banknote;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>Mesa {(p as any).orders?.restaurant_tables?.number || '?'}</TableCell>
                      <TableCell className="flex items-center gap-1"><Icon className="h-3 w-3" /> {methodLabels[p.method]}</TableCell>
                      <TableCell className="font-medium">R$ {Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell>{p.change_amount ? `R$ ${Number(p.change_amount).toFixed(2)}` : '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(p.created_at), 'HH:mm')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
