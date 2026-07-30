import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Loader2, Plus, Minus, Search, Trash2, ArrowRight, MessageSquarePlus, Users,
  MoreHorizontal, XCircle, Percent, Inbox, ArrowDownUp, ArrowUpDown, UserCog, ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import MenuImage from '@/components/MenuImage';
import { authorFields } from '@/lib/orders';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface CartItem { id: string; name: string; price: number; quantity: number; }

export default function CashierNewOrder() {
  const { user, currentRole, signOut } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableId, setTableId] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('new');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [noteOpen, setNoteOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

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
        .select('*, menu_categories(id, name)')
        .eq('restaurant_id', restaurantId!)
        .eq('available', true)
        .order('name');
      return data || [];
    },
  });

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    (menuItems || []).forEach(i => {
      const c = (i as any).menu_categories;
      if (c) map.set(c.id, c.name);
    });
    return Array.from(map.entries());
  }, [menuItems]);

  const filtered = useMemo(
    () => (menuItems || []).filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === 'all' || (i as any).category_id === category)
    ),
    [menuItems, search, category]
  );

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const total = Math.max(subtotal - discount, 0);
  const selectedTable = tables?.find(t => t.id === tableId);

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

  const removeItem = (id: string) => setCart(prev => prev.filter(c => c.id !== id));

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
            notes: notes.trim() || null,
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
          notes: notes.trim() || null,
          status: 'pending' as const,
        }))
      );
      if (itemsError) throw itemsError;

      const { data: current } = await supabase.from('orders').select('total').eq('id', targetOrderId).single();
      await supabase
        .from('orders')
        .update({ total: Number(current?.total || 0) + subtotal, status: 'pending' as const })
        .eq('id', targetOrderId);
    },
    onSuccess: () => {
      setCart([]); setCustomerName(''); setOrderId('new'); setNotes(''); setDiscount(0);
      queryClient.invalidateQueries({ queryKey: ['cashier-order-open'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-open-orders'] });
      toast.success('Pedido enviado para a cozinha!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao lançar pedido.'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F3') { e.preventDefault(); customerRef.current?.focus(); return; }
      if (e.key === 'F4') { e.preventDefault(); if (cart.length && tableId) send.mutate(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });


  const cartPanel = (
    <div className="flex h-full flex-col gap-4">
      <div className="pdv-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {selectedTable ? `Mesa ${selectedTable.number}` : 'Selecione a mesa'}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedTable ? `${selectedTable.capacity} pessoas` : 'Nenhuma mesa selecionada'}
            </div>
          </div>
          <ShoppingCart className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-4 grid gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Mesa *</Label>
            <Select value={tableId} onValueChange={v => { setTableId(v); setOrderId('new'); }}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione a mesa" /></SelectTrigger>
              <SelectContent>
                {tables?.map(t => <SelectItem key={t.id} value={t.id}>Mesa {t.number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {tableId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Comanda</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente (F3)</Label>
              <Input ref={customerRef} className="rounded-xl" placeholder="Ex.: João" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="pdv-card pdv-scroll min-h-[140px] flex-1 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {cart.length ? cart.map(c => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 border-b border-border/60 px-2 py-3 last:border-0"
            >
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" onClick={() => changeQty(c.id, -1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm font-semibold">{c.quantity}</span>
                <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" onClick={() => changeQty(c.id, 1)}><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">R$ {c.price.toFixed(2)} un.</div>
              </div>
              <div className="text-sm font-semibold">R$ {(c.price * c.quantity).toFixed(2)}</div>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => removeItem(c.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          )) : (
            <div className="flex h-full min-h-[120px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Toque nos produtos para adicionar à comanda.
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="pdv-card space-y-4 p-4">
        <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => setNoteOpen(true)}>
          <MessageSquarePlus className="h-4 w-4" /> {notes ? 'Editar observação' : 'Adicionar observação'}
        </Button>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>- R$ {discount.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Taxa</span><span>R$ 0,00</span></div>
        </div>

        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-3xl font-bold text-primary">R$ {total.toFixed(2)}</span>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          O recebimento é feito na aba <span className="font-medium text-foreground">Pagamentos</span>.
        </div>


        <Button
          className="pdv-ripple h-14 w-full gap-2 rounded-2xl text-base font-semibold"
          disabled={send.isPending || !cart.length || !tableId}
          onClick={() => send.mutate()}
        >
          {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
          Finalizar pedido
          <span className="ml-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">F4</span>
        </Button>
        <Button variant="ghost" className="w-full rounded-xl text-xs text-muted-foreground" onClick={() => navigate('/cashier/payments')}>
          Ir para recebimento de pagamentos
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] gap-4 p-4 md:-m-6 md:h-[calc(100%+3rem)] md:p-6">
      <div className="pdv-scroll flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
            <p className="text-xs text-muted-foreground">PDV • Frente de Caixa</p>
          </div>
          <div className="relative min-w-[220px] flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="h-11 rounded-2xl pl-9 pr-12"
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">F2</span>
          </div>
          <Button variant="outline" className="h-11 gap-2 rounded-2xl" onClick={() => customerRef.current?.focus()}>
            <Users className="h-4 w-4" /> Cliente
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">F3</span>
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl" onClick={() => toast.info('Mais opções em breve')}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="h-11 gap-2 rounded-2xl xl:hidden">
                <ShoppingCart className="h-4 w-4" /> {cart.length}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
              {cartPanel}
            </SheetContent>
          </Sheet>
        </div>

        <div className="pdv-scroll flex gap-2 overflow-x-auto pb-1">
          {[['all', 'Todos'], ...categories].map(([id, name]) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={cn(
                'pdv-ripple shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                category === id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map(item => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => add(item)}
              className="pdv-card pdv-card-hover pdv-ripple overflow-hidden text-left"
            >
              <MenuImage path={item.image_url} alt={item.name} className="h-28 w-full rounded-none" />
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{item.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{(item as any).menu_categories?.name || 'Sem categoria'}</div>
                <div className="mt-1 text-base font-bold text-primary">R$ {Number(item.price).toFixed(2)}</div>
              </div>
            </motion.button>
          ))}
          {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
        </div>

      </div>

      <aside className="hidden w-[430px] shrink-0 xl:block">{cartPanel}</aside>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Observação do pedido</DialogTitle></DialogHeader>
          <Textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: sem cebola, ponto da carne..." />
          <DialogFooter><Button onClick={() => setNoteOpen(false)}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Desconto (R$)</DialogTitle></DialogHeader>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={discount || ''}
            onChange={e => setDiscount(Number(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">O desconto é exibido no resumo do caixa; o valor lançado na comanda segue o subtotal dos itens.</p>
          <DialogFooter><Button onClick={() => setDiscountOpen(false)}>Aplicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
