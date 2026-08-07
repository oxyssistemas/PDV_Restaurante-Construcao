import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, Minus, Search, Bike, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { authorFields } from '@/lib/orders';
import { courierStatusLabels, courierDotClass } from '@/lib/delivery';

const methods = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote },
  { value: 'credit_card', label: 'Crédito', icon: CreditCard },
  { value: 'debit_card', label: 'Débito', icon: CreditCard },
  { value: 'pix', label: 'PIX', icon: Smartphone },
];

interface CartItem { id: string; name: string; price: number; quantity: number; }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string;
  cashRegisterId?: string | null;
}

export default function DeliverySaleDialog({ open, onOpenChange, restaurantId, cashRegisterId }: Props) {
  const { user, currentRole } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('0');
  const [courierId, setCourierId] = useState<string | null>(null);
  const [method, setMethod] = useState('');

  const { data: menuItems } = useQuery({
    queryKey: ['delivery-sale-menu', restaurantId],
    enabled: open && !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('id, name, price')
        .eq('restaurant_id', restaurantId)
        .eq('available', true)
        .order('name');
      return data || [];
    },
  });

  const { data: couriers } = useQuery({
    queryKey: ['couriers', restaurantId],
    enabled: open && !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('couriers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
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

  const reset = () => {
    setCart([]); setName(''); setPhone(''); setAddress(''); setFee('0');
    setCourierId(null); setMethod(''); setSearch('');
  };

  const register = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !address.trim()) throw new Error('Informe nome e endereço do cliente');
      if (!cart.length) throw new Error('Adicione itens ao pedido');
      if (!method) throw new Error('Selecione a forma de pagamento');

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          order_type: 'delivery',
          delivery_status: 'pending',
          status: 'pending' as const,
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          customer_address: address.trim(),
          delivery_fee: parseFloat(fee) || 0,
          total: subtotal,
          courier_id: courierId,
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

      const { error: payError } = await supabase.from('payments').insert({
        order_id: order.id,
        restaurant_id: restaurantId,
        cash_register_id: cashRegisterId || null,
        method: method as any,
        amount: total,
        change_amount: 0,
        user_id: user!.id,
      });
      if (payError) throw payError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-today-payments'] });
      toast.success('Venda delivery registrada! Pedido enviado à cozinha e ao delivery.');
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao registrar venda.'),
  });

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bike className="h-5 w-5 text-primary" /> Venda cliente delivery</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {filtered.map(item => (
                <button key={item.id} onClick={() => add(item)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border p-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 font-semibold text-primary">R$ {Number(item.price).toFixed(2)}</span>
                </button>
              ))}
              {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum item disponível.</p>}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
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
              )) : <p className="text-sm text-muted-foreground">Selecione os itens do pedido.</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço *</Label>
              <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro, referência" />
            </div>
            <div className="space-y-1.5">
              <Label>Taxa de entrega (R$)</Label>
              <Input type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Entregador</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(couriers || []).map(c => (
                  <button key={c.id} onClick={() => setCourierId(courierId === c.id ? null : c.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-colors',
                      courierId === c.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    )}>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', courierDotClass(c.status))} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-muted-foreground">{courierStatusLabels[c.status]}</span>
                    </span>
                  </button>
                ))}
                {!couriers?.length && <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado.</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Forma de pagamento *</Label>
              <div className="grid grid-cols-2 gap-2">
                {methods.map(m => (
                  <button key={m.value} onClick={() => setMethod(m.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      method === m.value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                    )}>
                    <m.icon className="h-4 w-4" /> {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total com taxa</span>
              <span className="text-2xl font-bold text-primary">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={register.isPending} onClick={() => register.mutate()}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
