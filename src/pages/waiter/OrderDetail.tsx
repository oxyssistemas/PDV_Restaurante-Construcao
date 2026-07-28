import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Minus, Send, ArrowLeft, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CartItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

const itemStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export default function OrderDetail() {
  const { orderId } = useParams();
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant_tables(number)')
        .eq('id', orderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('*, menu_items(name)')
        .eq('order_id', orderId!)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['waiter-categories', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ['waiter-menu-items', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .eq('available', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, queryClient]);

  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) {
        return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }];
    });
  };

  const updateCartQty = (menuItemId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.menu_item_id !== menuItemId) return c;
      const newQty = c.quantity + delta;
      return newQty <= 0 ? null! : { ...c, quantity: newQty };
    }).filter(Boolean));
  };

  const updateCartNotes = (menuItemId: string, notes: string) => {
    setCart(prev => prev.map(c => c.menu_item_id === menuItemId ? { ...c, notes } : c));
  };

  const sendOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error('Carrinho vazio');

      const items = cart.map(c => ({
        order_id: orderId!,
        menu_item_id: c.menu_item_id,
        quantity: c.quantity,
        unit_price: c.price,
        notes: c.notes || null,
        status: 'pending' as const,
      }));

      const { error } = await supabase.from('order_items').insert(items);
      if (error) throw error;

      const newTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
      const currentTotal = Number(order?.total || 0);
      await supabase
        .from('orders')
        .update({ total: currentTotal + newTotal, status: 'pending' as const })
        .eq('id', orderId!);
    },
    onSuccess: () => {
      setCart([]);
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      toast({ title: 'Itens enviados!', description: 'Pedido enviado para a cozinha.' });
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível enviar o pedido.', variant: 'destructive' });
    },
  });

  const markDelivered = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('order_items')
        .update({ status: 'delivered' as const })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
      toast({ title: 'Item marcado como entregue!' });
    },
  });

  const closeTable = useMutation({
    mutationFn: async () => {
      await supabase
        .from('orders')
        .update({ status: 'delivered' as const })
        .eq('id', orderId!);
      if (order?.table_id) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'free' as const })
          .eq('id', order.table_id);
      }
    },
    onSuccess: () => {
      toast({ title: 'Mesa fechada!', description: 'Conta enviada para o caixa.' });
      navigate('/waiter');
    },
  });

  const filteredMenu = menuItems?.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (orderLoading || itemsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const allDelivered = orderItems && orderItems.length > 0 && orderItems.every(i => i.status === 'delivered' || i.status === 'cancelled');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/waiter/orders')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">
              Mesa {(order as any)?.restaurant_tables?.number || '?'}
              {(order as any)?.customer_name ? ` — ${(order as any).customer_name}` : ''}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Renomear comanda"
              onClick={() => setNameDraft((order as any)?.customer_name || '')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Total: R$ {Number(order?.total || 0).toFixed(2)}</p>
        </div>
      </div>

      <Dialog open={nameDraft !== null} onOpenChange={(o) => !o && setNameDraft(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nome da comanda</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Ex.: João, Camisa azul"
            value={nameDraft ?? ''}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') renameOrder.mutate(nameDraft ?? ''); }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNameDraft(null)}>Cancelar</Button>
            <Button onClick={() => renameOrder.mutate(nameDraft ?? '')} disabled={renameOrder.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>


      <div className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Itens do Pedido</h2>
        {orderItems && orderItems.length > 0 ? (
          orderItems.map(item => (
            <Card key={item.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{(item as any).menu_items?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.quantity}x — R$ {(Number(item.unit_price) * item.quantity).toFixed(2)}
                  </div>
                  {item.notes && <div className="text-xs text-muted-foreground italic">Obs: {item.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === 'ready' ? 'default' : 'outline'} className="text-xs">
                    {itemStatusLabels[item.status]}
                  </Badge>
                  {item.status === 'ready' && (
                    <Button size="sm" variant="outline" onClick={() => markDelivered.mutate(item.id)}>
                      Entregar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">Nenhum item ainda. Adicione pelo cardápio.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> Adicionar Itens</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Cardápio</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Buscar item..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            {categories?.map(cat => {
              const items = filteredMenu?.filter(i => i.category_id === cat.id);
              if (!items?.length) return null;
              return (
                <div key={cat.id} className="mb-4">
                  <h3 className="font-semibold text-sm text-muted-foreground mb-2">{cat.name}</h3>
                  <div className="space-y-2">
                    {items.map(item => {
                      const inCart = cart.find(c => c.menu_item_id === item.id);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground">R$ {Number(item.price).toFixed(2)}</div>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(item.id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-5 text-center">{inCart.quantity}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(item.id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => addToCart(item)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {(() => {
              const uncategorized = filteredMenu?.filter(i => !i.category_id);
              if (!uncategorized?.length) return null;
              return (
                <div className="mb-4">
                  <h3 className="font-semibold text-sm text-muted-foreground mb-2">Sem categoria</h3>
                  <div className="space-y-2">
                    {uncategorized.map(item => {
                      const inCart = cart.find(c => c.menu_item_id === item.id);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground">R$ {Number(item.price).toFixed(2)}</div>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(item.id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-5 text-center">{inCart.quantity}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(item.id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => addToCart(item)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {cart.length > 0 && (
              <div className="border-t pt-4 mt-4 space-y-3">
                <h3 className="font-semibold">Carrinho ({cart.reduce((s, c) => s + c.quantity, 0)} itens)</h3>
                {cart.map(c => (
                  <div key={c.menu_item_id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{c.quantity}x {c.name}</span>
                      <span>R$ {(c.price * c.quantity).toFixed(2)}</span>
                    </div>
                    <Textarea
                      placeholder="Observações (ex: sem cebola)"
                      value={c.notes}
                      onChange={e => updateCartNotes(c.menu_item_id, e.target.value)}
                      className="text-xs h-8 min-h-[2rem]"
                    />
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm border-t pt-2">
                  <span>Total</span>
                  <span>R$ {cart.reduce((s, c) => s + c.price * c.quantity, 0).toFixed(2)}</span>
                </div>
                <Button className="w-full gap-1" onClick={() => sendOrder.mutate()} disabled={sendOrder.isPending}>
                  {sendOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar para Cozinha
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {allDelivered && (
          <Button variant="destructive" className="gap-1" onClick={() => closeTable.mutate()} disabled={closeTable.isPending}>
            Fechar Mesa
          </Button>
        )}
      </div>
    </div>
  );
}
