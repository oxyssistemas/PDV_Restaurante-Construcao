import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Plus, Minus, Trash2, Copy, MessageSquarePlus, Send, Users,
  Clock, Pencil, ShoppingCart, BellRing, ReceiptText, ArrowLeftRight, CheckCircle2, Search, Printer,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MenuImage from '@/components/MenuImage';
import { cn } from '@/lib/utils';
import { authorLabel } from '@/lib/orders';
import { printOrderTicket } from '@/lib/printing';
import { logAudit } from '@/lib/audit';
import { brl, elapsedSince } from '@/lib/waiter';

interface CartItem { key: string; menu_item_id: string; name: string; price: number; quantity: number; notes: string; }

const itemStatusLabels: Record<string, string> = {
  pending: 'Pedido recebido',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const itemStatusStyle: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  preparing: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  ready: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function OrderDetail() {
  const { orderId } = useParams();
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [noteFor, setNoteFor] = useState<CartItem | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [sent, setSent] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders').select('*, restaurant_tables(id, number, capacity)').eq('id', orderId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ['order-items', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items').select('*, menu_items(name)').eq('order_id', orderId!).order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ['waiter-menu-items', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items').select('*, menu_categories(id, name)')
        .eq('restaurant_id', restaurantId!).eq('available', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: tables } = useQuery({
    queryKey: ['waiter-transfer-tables', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', restaurantId!).order('number');
      return data || [];
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-rt-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
        if ((payload.new as any)?.status === 'ready' && (payload.old as any)?.status !== 'ready') {
          toast.success('Pedido pronto para retirada!');
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, queryClient]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    (menuItems || []).forEach(i => {
      const c = (i as any).menu_categories;
      if (c) map.set(c.id, c.name);
    });
    return Array.from(map.entries());
  }, [menuItems]);

  const filtered = (menuItems || []).filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) &&
    (category === 'all' || (i as any).category_id === category)
  );

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const table = (order as any)?.restaurant_tables;

  const addItem = (item: any) => {
    setCart(prev => {
      const found = prev.find(c => c.menu_item_id === item.id && !c.notes);
      if (found) return prev.map(c => c.key === found.key ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        key: `${item.id}-${Date.now()}`, menu_item_id: item.id, name: item.name,
        price: Number(item.price), quantity: 1, notes: '',
      }];
    });
  };

  const changeQty = (key: string, delta: number) =>
    setCart(prev => prev.flatMap(c => {
      if (c.key !== key) return [c];
      const q = c.quantity + delta;
      return q <= 0 ? [] : [{ ...c, quantity: q }];
    }));

  const duplicate = (key: string) =>
    setCart(prev => {
      const found = prev.find(c => c.key === key);
      return found ? [...prev, { ...found, key: `${found.menu_item_id}-${Date.now()}` }] : prev;
    });

  const remove = (key: string) => setCart(prev => prev.filter(c => c.key !== key));

  const sendOrder = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error('Carrinho vazio');
      const { error } = await supabase.from('order_items').insert(cart.map(c => ({
        order_id: orderId!, menu_item_id: c.menu_item_id, quantity: c.quantity,
        unit_price: c.price, notes: c.notes || null, status: 'pending' as const,
      })));
      if (error) throw error;
      await supabase.from('orders')
        .update({ total: Number(order?.total || 0) + subtotal, status: 'pending' as const })
        .eq('id', orderId!);
    },
    onSuccess: () => {
      setCart([]);
      setSent(true);
      setTimeout(() => setSent(false), 1600);
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      toast.success('Pedido enviado para a cozinha!');
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível enviar o pedido.'),
  });

  const notify = useMutation({
    mutationFn: async ({ title, message, type, roles }: { title: string; message: string; type: string; roles: string[] }) => {
      const { error } = await supabase.from('notifications').insert({
        restaurant_id: restaurantId!, title, message, type, target_roles: roles,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Solicitação enviada!'),
    onError: () => toast.error('Não foi possível enviar a solicitação.'),
  });

  const renameOrder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('orders').update({ customer_name: name.trim() || null }).eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      setNameDraft(null);
      toast.success('Comanda atualizada!');
    },
  });

  const transfer = useMutation({
    mutationFn: async (tableId: string) => {
      const { error } = await supabase.from('orders').update({ table_id: tableId }).eq('id', orderId!);
      if (error) throw error;
      await supabase.from('restaurant_tables').update({ status: 'occupied' as const }).eq('id', tableId);
    },
    onSuccess: () => {
      setTransferOpen(false);
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success('Comanda transferida!');
    },
    onError: () => toast.error('Não foi possível transferir a comanda.'),
  });

  const markDelivered = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('order_items').update({ status: 'delivered' as const }).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-items', orderId] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cartPanel = (
    <div className="flex h-full flex-col gap-4">
      <div className="pdv-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-semibold">Mesa {table?.number ?? '?'}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setNameDraft((order as any)?.customer_name || '')}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {(order as any)?.customer_name || 'Sem cliente'} • {authorLabel((order || {}) as any)}
            </div>
          </div>
          <ShoppingCart className="h-5 w-5 shrink-0 text-primary" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {table?.capacity ?? '-'} pessoas</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {elapsedSince(order?.created_at)}</span>
        </div>
      </div>

      <div className="pdv-card pdv-scroll min-h-[140px] flex-1 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {cart.length ? cart.map(c => (
            <motion.div key={c.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}
              className="border-b border-border/60 px-2 py-3 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => changeQty(c.key, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm font-semibold">{c.quantity}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" onClick={() => changeQty(c.key, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">{brl(c.price)} un.</div>
                </div>
                <div className="text-sm font-semibold">{brl(c.price * c.quantity)}</div>
              </div>
              {c.notes && <div className="mt-1 pl-1 text-[11px] italic text-muted-foreground">Obs: {c.notes}</div>}
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-[11px]" onClick={() => setNoteFor(c)}>
                  <MessageSquarePlus className="h-3 w-3" /> Observação
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-[11px]" onClick={() => duplicate(c.key)}>
                  <Copy className="h-3 w-3" /> Duplicar
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 rounded-lg p-0 text-destructive hover:bg-destructive/10" onClick={() => remove(c.key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )) : (
            <div className="flex h-full min-h-[120px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Toque nos produtos para adicionar à comanda.
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="pdv-card space-y-3 p-4">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Novos itens</span><span>{brl(subtotal)}</span>
        </div>
        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Parcial da mesa</span>
          <span className="text-3xl font-bold text-primary">{brl(Number(order?.total || 0) + subtotal)}</span>
        </div>

        <Button
          className="pdv-ripple h-16 w-full gap-2 rounded-2xl text-base font-semibold"
          disabled={sendOrder.isPending || !cart.length}
          onClick={() => sendOrder.mutate()}
        >
          {sendOrder.isPending ? <Loader2 className="h-5 w-5 animate-spin" />
            : sent ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          {sent ? 'Enviado!' : 'Enviar Pedido para Cozinha'}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs"
            onClick={() => notify.mutate({
              title: 'Chamado de gerente',
              message: `Mesa ${table?.number} solicitou atendimento do gerente.`,
              type: 'manager_call', roles: ['admin'],
            })}>
            <BellRing className="h-4 w-4" /> Chamar gerente
          </Button>
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Transferir mesa
          </Button>
        </div>

        <Button
          variant="outline"
          className="h-14 w-full gap-2 rounded-2xl border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10"
          onClick={() => notify.mutate({
            title: 'Fechamento solicitado',
            message: `Mesa ${table?.number} solicitou fechamento.`,
            type: 'bill_request', roles: ['cashier', 'admin'],
          })}
        >
          <ReceiptText className="h-5 w-5" /> Solicitar Fechamento da Conta
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          O recebimento é feito exclusivamente pelo Caixa.
        </p>
      </div>
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] gap-4 p-4 md:-m-6 md:h-[calc(100%+3rem)] md:p-6">
      <div className="pdv-scroll flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-2xl" onClick={() => navigate('/waiter')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight">Mesa {table?.number ?? '?'}</h1>
            <p className="text-xs text-muted-foreground">
              {(order as any)?.customer_name || 'Sem cliente'} • {elapsedSince(order?.created_at)} • {brl(Number(order?.total || 0))}
            </p>
          </div>
          <div className="relative min-w-[200px] flex-1 md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-12 rounded-2xl pl-9" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="h-12 gap-2 rounded-2xl xl:hidden">
                <ShoppingCart className="h-5 w-5" /> {cart.reduce((s, c) => s + c.quantity, 0)}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">{cartPanel}</SheetContent>
          </Sheet>
        </div>

        <div className="pdv-scroll flex gap-2 overflow-x-auto pb-1">
          {[['all', 'Todos'], ...categories].map(([id, name]) => (
            <button key={id} onClick={() => setCategory(id)}
              className={cn('pdv-ripple shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all',
                category === id ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
              {name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map(item => (
            <motion.button key={item.id} whileTap={{ scale: 0.97 }} onClick={() => addItem(item)}
              className="pdv-card pdv-card-hover pdv-ripple overflow-hidden text-left">
              <MenuImage path={item.image_url} alt={item.name} className="h-32 w-full rounded-none" />
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{item.name}</div>
                <div className="line-clamp-1 text-[11px] text-muted-foreground">{item.description || (item as any).menu_categories?.name || ''}</div>
                <div className="mt-1 text-base font-bold text-primary">{brl(Number(item.price))}</div>
              </div>
            </motion.button>
          ))}
          {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Acompanhamento do pedido</h2>
          {orderItems?.length ? orderItems.map(item => (
            <div key={item.id} className="pdv-card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.quantity}x {(item as any).menu_items?.name}</div>
                {item.notes && <div className="truncate text-[11px] italic text-muted-foreground">Obs: {item.notes}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={cn('text-[11px]', itemStatusStyle[item.status])}>
                  {itemStatusLabels[item.status]}
                </Badge>
                {item.status === 'ready' && (
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => markDelivered.mutate(item.id)}>
                    Entregar
                  </Button>
                )}
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nenhum item enviado ainda.</p>}
        </div>
      </div>

      <aside className="hidden w-[430px] shrink-0 xl:block">{cartPanel}</aside>

      <Dialog open={!!noteFor} onOpenChange={o => !o && setNoteFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Observações • {noteFor?.name}</DialogTitle></DialogHeader>
          <Textarea rows={4} value={noteFor?.notes ?? ''} placeholder="Ex.: sem cebola, ponto da carne, adicional de queijo..."
            onChange={e => setNoteFor(n => n && { ...n, notes: e.target.value })} />
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setNoteFor(null)}>Cancelar</Button>
            <Button className="rounded-xl" onClick={() => {
              if (noteFor) setCart(prev => prev.map(c => c.key === noteFor.key ? { ...c, notes: noteFor.notes } : c));
              setNoteFor(null);
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nameDraft !== null} onOpenChange={o => !o && setNameDraft(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nome da comanda</DialogTitle></DialogHeader>
          <Input autoFocus className="h-12 rounded-xl" placeholder="Ex.: João, Camisa azul"
            value={nameDraft ?? ''} onChange={e => setNameDraft(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setNameDraft(null)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={renameOrder.isPending} onClick={() => renameOrder.mutate(nameDraft ?? '')}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Transferir comanda</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Mesa de destino</Label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecione a mesa" /></SelectTrigger>
              <SelectContent>
                {tables?.filter(t => t.id !== table?.id).map(t => (
                  <SelectItem key={t.id} value={t.id}>Mesa {t.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={!transferTo || transfer.isPending} onClick={() => transfer.mutate(transferTo)}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
