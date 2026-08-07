import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Minus, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import MenuImage from '@/components/MenuImage';
import { authorFields } from '@/lib/orders';
import { cn } from '@/lib/utils';
import { courierStatusLabels, courierDotClass } from '@/lib/delivery';

interface CartItem { id: string; name: string; price: number; quantity: number; }

export default function NewDelivery() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('0');

  const { data: menuItems, isLoading } = useQuery({
    queryKey: ['delivery-menu', restaurantId],
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

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const total = subtotal + (parseFloat(fee) || 0);

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

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !address.trim()) throw new Error('Informe nome e endereço do cliente');
      if (!cart.length) throw new Error('Adicione itens ao pedido');

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantId!,
          order_type: 'delivery',
          delivery_status: 'pending',
          status: 'pending' as const,
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          customer_address: address.trim(),
          delivery_fee: parseFloat(fee) || 0,
          total: subtotal,
          ...authorFields(user, currentRole?.role),
        })
        .select()
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from('order_items').insert(
        cart.map(c => ({
          order_id: order.id,
          menu_item_id: c.id,
          quantity: c.quantity,
          unit_price: c.price,
          status: 'pending' as const,
        }))
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      toast.success('Pedido de delivery criado e enviado à cozinha!');
      navigate('/delivery');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar pedido.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Novo Pedido Delivery</h1>

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
          <CardHeader className="pb-3"><CardTitle className="text-lg">Dados da entrega</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>Endereço *</Label>
              <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro, referência" />
            </div>
            <div className="space-y-2">
              <Label>Taxa de entrega (R$)</Label>
              <Input type="number" step="0.01" min="0" value={fee} onChange={e => setFee(e.target.value)} />
            </div>

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
              <span className="text-sm text-muted-foreground">Total com taxa</span>
              <span className="text-2xl font-bold">R$ {total.toFixed(2)}</span>
            </div>

            <Button className="w-full gap-2" size="lg" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Criar pedido
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
