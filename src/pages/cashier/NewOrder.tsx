import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Minus, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import MenuImage from '@/components/MenuImage';
import { authorFields } from '@/lib/orders';

interface CartItem { id: string; name: string; price: number; quantity: number; }

export default function CashierNewOrder() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableId, setTableId] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('new');
  const [customerName, setCustomerName] = useState('');

  const { data: tables } = useQuery({
    queryKey: ['cashier-order-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', restaurantId!).order('number');
      return data || [];
    },
  });

  const { data: openOrders } = useQuery({
    queryKey: ['cashier-order-open', restaurantId, tableId],
    enabled: !!restaurantId && !!tableId,
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, customer_name, total')
        .eq('restaurant_id', restaurantId!)
        .eq('table_id', tableId)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at');
      return data || [];
    },
  });

  const { data: menuItems, isLoading } = useQuery({
    queryKey: ['cashier-menu', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('restaurant_id', restaurantId!)
        .eq('available', true)
        .order('name');
      return data || [];
    },
  });

  const filtered = useMemo(
    () => (menuItems || []).filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [menuItems, search]
  );

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  const add = (item: any) => setCart(prev => {
    const found = prev.find(c => c.id === item.id);
    if (found) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
    return [...prev, { id: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
  });

  const changeQty = (id: string, delta: number) =>
    setCart(prev => prev.flatMap(c => {
      if (c.id !== id) return [c];
      const q = c.quantity + delta;
      return q <= 0 ? [] : [{ ...c, quantity: q }];
    }));

  const send = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('Selecione uma mesa');
      if (!cart.length) throw new Error('Carrinho vazio');

      let targetOrderId = orderId;
      if (orderId === 'new') {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            restaurant_id: restaurantId!,
            table_id: tableId,
            status: 'pending' as const,
            order_type: 'dine_in',
            customer_name: customerName.trim() || null,
            ...authorFields(user, currentRole?.role),
          })
          .select()
          .single();
        if (error) throw error;
        targetOrderId = order.id;
        await supabase.from('restaurant_tables').update({ status: 'occupied' as const }).eq('id', tableId);
      }

      const { error: itemsError } = await supabase.from('order_items').insert(
        cart.map(c => ({
          order_id: targetOrderId,
          menu_item_id: c.id,
          quantity: c.quantity,
          unit_price: c.price,
          status: 'pending' as const,
        }))
      );
      if (itemsError) throw itemsError;

      const { data: current } = await supabase.from('orders').select('total').eq('id', targetOrderId).single();
      await supabase
        .from('orders')
        .update({ total: Number(current?.total || 0) + total, status: 'pending' as const })
        .eq('id', targetOrderId);
    },
    onSuccess: () => {
      setCart([]); setCustomerName(''); setOrderId('new');
      queryClient.invalidateQueries({ queryKey: ['cashier-order-open'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-open-orders'] });
      toast.success('Pedido enviado para a cozinha!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao lançar pedido.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Lançar Pedido</h1>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Cardápio</CardTitle>
            <div className="relative pt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => add(item)}
                  className="flex items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <MenuImage path={item.image_url} alt={item.name} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{(item as any).menu_categories?.name || 'Sem categoria'}</div>
                    <div className="text-sm font-bold text-primary">R$ {Number(item.price).toFixed(2)}</div>
                  </div>
                </button>
              ))}
              {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum item disponível.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-lg">Comanda</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mesa *</Label>
              <Select value={tableId} onValueChange={(v) => { setTableId(v); setOrderId('new'); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a mesa" /></SelectTrigger>
                <SelectContent>
                  {tables?.map(t => <SelectItem key={t.id} value={t.id}>Mesa {t.number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {tableId && (
              <div className="space-y-2">
                <Label>Comanda</Label>
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nova comanda</SelectItem>
                    {openOrders?.map((o, idx) => (
                      <SelectItem key={o.id} value={o.id}>{o.customer_name || `Comanda ${idx + 1}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {orderId === 'new' && (
              <div className="space-y-2">
                <Label>Identificação (opcional)</Label>
                <Input placeholder="Ex.: João" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
            )}

            <div className="space-y-2 border-t pt-3">
              {cart.length ? cart.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(c.id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-5 text-center">{c.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(c.id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <span className="w-20 text-right">R$ {(c.price * c.quantity).toFixed(2)}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">Toque nos itens do cardápio para adicionar.</p>}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">R$ {total.toFixed(2)}</span>
            </div>

            <Badge variant="outline" className="w-full justify-center">
              Lançado por {user?.email?.split('@')[0]} (Caixa)
            </Badge>

            <Button className="w-full gap-2" size="lg" disabled={send.isPending || !cart.length || !tableId} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar para Cozinha
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
