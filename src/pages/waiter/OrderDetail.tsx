import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Plus, Minus, Trash2, Copy, MessageSquarePlus, Send, Users,
  Clock, Pencil, ShoppingCart, BellRing, ReceiptText, ArrowLeftRight, CheckCircle2, Search, Printer, UtensilsCrossed,
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
import { usePrinterSettings } from '@/hooks/usePrinterSettings';
import { logAudit } from '@/lib/audit';
import { percentLabel, serviceFeeOf, useServiceSettings } from '@/lib/serviceCharge';
import { brl, elapsedSince } from '@/lib/waiter';
import { useRodizios } from '@/components/admin/RodiziosPanel';
import OptionPicker, { type PickedItem } from '@/components/OptionPicker';
import WeightDialog from '@/components/WeightDialog';
import { itemOnNow, useMenuOptions } from '@/lib/menuOptions';
import { discountLabel } from '@/lib/promotions';

interface CartItem {
  key: string; menu_item_id: string; name: string; price: number; quantity: number; notes: string; rodizio?: boolean;
  options?: string[]; options_text?: string | null; weight_kg?: number;
}

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
  const { getConfig } = usePrinterSettings(restaurantId);
  const { data: service } = useServiceSettings(restaurantId);
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
  const [rodizioForm, setRodizioForm] = useState<{ id: string; adults: number; children: number } | null>(null);
  const { data: rodizios } = useRodizios(restaurantId);
  const { data: optionMap } = useMenuOptions(restaurantId);
  const [picking, setPicking] = useState<any | null>(null);
  const [weighing, setWeighing] = useState<any | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders').select('*, restaurant_tables(id, number, capacity, rodizio_id, rodizio_adults, rodizio_children)').eq('id', orderId!).single();
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

  const { data: restaurant } = useQuery({
    queryKey: ['restaurant-name', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from('restaurants').select('name').eq('id', restaurantId!).maybeSingle();
      return data;
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

  const inRodizioId = (item: any) => !!(order as any)?.restaurant_tables?.rodizio_id
    && ((item.rodizio_ids ?? []) as string[]).includes((order as any).restaurant_tables.rodizio_id);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    (menuItems || []).forEach(i => {
      const c = (i as any).menu_categories;
      if (c) map.set(c.id, c.name);
    });
    return Array.from(map.entries());
  }, [menuItems]);

  const filtered = (menuItems || []).filter(i =>
    itemOnNow(i) &&
    i.name.toLowerCase().includes(search.toLowerCase()) &&
    (category === 'all' || (i as any).category_id === category)
  ).sort((a, b) => Number(inRodizioId(b)) - Number(inRodizioId(a)));

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const table = (order as any)?.restaurant_tables;
  // mesa em rodízio: os pratos do rodízio saem sem cobrar; o resto tem o preço normal
  const rodizio = rodizios?.find(r => r.id === table?.rodizio_id) ?? null;
  const inRodizio = (item: any) => !!rodizio && ((item.rodizio_ids ?? []) as string[]).includes(rodizio.id);

  const addItem = (item: any) => {
    const free = inRodizio(item);
    if (item.sold_by_weight) { setWeighing(item); return; }
    if (optionMap?.get(item.id)?.length) { setPicking(item); return; }
    setCart(prev => {
      const found = prev.find(c => c.menu_item_id === item.id && !c.notes);
      if (found) return prev.map(c => c.key === found.key ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        key: `${item.id}-${Date.now()}`, menu_item_id: item.id, name: item.name,
        price: free ? 0 : Number(item.price), quantity: 1, notes: '', rodizio: free,
      }];
    });
  };

  /** Põe a mesa no rodízio (ou muda as pessoas): a cobrança entra na comanda como "Rodízio <nome>". */
  const saveRodizio = useMutation({
    mutationFn: async (f: { id: string; adults: number; children: number }) => {
      const r = rodizios?.find(x => x.id === f.id);
      if (!r || !table?.id) throw new Error('Escolha o rodízio.');
      if (f.adults + f.children < 1) throw new Error('Informe quantas pessoas estão no rodízio.');
      const chargeIds = (rodizios ?? []).map(x => x.charge_item_id).filter(Boolean) as string[];
      const old = (orderItems ?? []).filter(i => chargeIds.includes(i.menu_item_id) && i.status !== 'cancelled');
      const removed = old.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
      if (old.length) {
        const { error } = await supabase.from('order_items').delete().in('id', old.map(i => i.id));
        if (error) throw error;
      }
      const lines = [
        f.adults > 0 && { quantity: f.adults, unit_price: Number(r.price_adult), notes: 'Adulto' },
        f.children > 0 && { quantity: f.children, unit_price: Number(r.price_child ?? r.price_adult), notes: 'Criança' },
      ].filter(Boolean) as { quantity: number; unit_price: number; notes: string }[];
      if (!r.charge_item_id) throw new Error('Rodízio sem item de cobrança. Salve o rodízio de novo no cardápio.');
      const { error } = await supabase.from('order_items').insert(lines.map(l => ({
        ...l, order_id: orderId!, menu_item_id: r.charge_item_id!, status: 'delivered' as const,
      })));
      if (error) throw error;
      const added = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      await supabase.from('orders').update({ total: Math.max(Number(order?.total || 0) - removed + added, 0) }).eq('id', orderId!);
      const { error: tErr } = await supabase.from('restaurant_tables').update({
        rodizio_id: r.id, rodizio_adults: f.adults, rodizio_children: f.children,
        ...(table.rodizio_id ? {} : { rodizio_started_at: new Date().toISOString() }),
      }).eq('id', table.id);
      if (tErr) throw tErr;
      return r.name;
    },
    onSuccess: (name) => {
      setRodizioForm(null);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success(`Mesa ${table?.number} no rodízio ${name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Encerra o rodízio da mesa: a cobrança continua na comanda, os próximos pedidos voltam ao preço normal. */
  const endRodizio = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('restaurant_tables').update({
        rodizio_id: null, rodizio_adults: null, rodizio_children: null, rodizio_started_at: null,
      }).eq('id', table!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRodizioForm(null);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] });
      toast.success('Rodízio encerrado. A cobrança continua na comanda.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPicked = (item: any, p: PickedItem) => setCart(prev => [...prev, {
    key: `${item.id}-${Date.now()}`, menu_item_id: item.id, name: item.name, price: p.price, quantity: p.quantity,
    notes: p.notes, rodizio: inRodizio(item), options: p.options, options_text: p.options_text,
  }]);

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
        options: c.options ?? [], options_text: c.options_text ?? null, weight_kg: c.weight_kg ?? null,
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

  const handlePrintTicket = (kind: 'full' | 'kitchen') => {
    if (!order) return;
    const list = kind === 'kitchen' && cart.length
      ? cart.map(c => ({ name: c.name, quantity: c.quantity, unit_price: c.price, notes: [c.options_text, c.notes].filter(Boolean).join(' — ') || null }))
      : (orderItems || []).map(i => ({
        name: (i as any).menu_items?.name || 'Item',
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        notes: [i.options_text, i.notes].filter(Boolean).join(' — ') || null,
      }));
    if (!list.length) { toast.error('Nenhum item para imprimir.'); return; }
    const subtotal = list.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const serviceFee = kind === 'kitchen' ? 0 : serviceFeeOf(subtotal, service);
    printOrderTicket({
      restaurantName: restaurant?.name || 'Oxys Restaurante',
      title: kind === 'kitchen' ? 'Via da cozinha' : 'Pedido detalhado',
      showPrices: kind !== 'kitchen',
      order: {
        id: (order as any).id,
        created_at: (order as any).created_at,
        customer_name: (order as any).customer_name,
        table_number: table?.number ?? null,
        total: kind === 'kitchen' ? undefined : subtotal + serviceFee,
        service_fee: serviceFee,
        service_label: service?.service_enabled ? `Servico ${percentLabel(service.service_percent)} (opcional)` : null,
        created_by_name: (order as any).created_by_name,
        created_by_role: (order as any).created_by_role,
      },
      items: list,
      config: getConfig(kind === 'kitchen' ? 'kitchen' : 'order'),
    });
    logAudit({
      restaurantId: restaurantId!,
      role: currentRole?.role,
      action: 'print',
      entity: 'order',
      entityId: (order as any).id,
      summary: `${kind === 'kitchen' ? 'Via da cozinha' : 'Pedido detalhado'} impresso • Mesa ${table?.number ?? '-'}`,
    });
  };


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
        {rodizio && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
            <UtensilsCrossed className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <b>Rodízio {rodizio.name}</b> · {table?.rodizio_adults ?? 0} adulto(s){table?.rodizio_children ? ` · ${table.rodizio_children} criança(s)` : ''}
            </span>
          </div>
        )}
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
                  {c.options_text && <div className="text-[11px] text-primary">{c.options_text}</div>}
                  <div className="text-[11px] text-muted-foreground">{c.rodizio ? 'Incluso no rodízio' : `${brl(c.price)} un.`}</div>
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
        {Number((order as any)?.discount) > 0 && (
          <div className="flex justify-between gap-2 text-sm text-[hsl(var(--success))]">
            <span className="min-w-0 truncate">Desconto · {discountLabel(order as any)}</span><span>- {brl(Number((order as any).discount))}</span>
          </div>
        )}
        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Parcial da mesa</span>
          <span className="text-3xl font-bold text-primary">{brl(Number(order?.total || 0) - Number((order as any)?.discount || 0) + subtotal)}</span>
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

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs" onClick={() => handlePrintTicket('full')}>
            <Printer className="h-4 w-4" /> Imprimir pedido
          </Button>
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs" onClick={() => handlePrintTicket('kitchen')}>
            <Printer className="h-4 w-4" /> Via da cozinha
          </Button>
        </div>
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
            <h1 className="text-2xl font-bold tracking-tight">Mesa {table?.number ?? '?'}{(order as any)?.card_code ? ` · Cartão #${(order as any).card_code}` : ''}</h1>
            <p className="text-xs text-muted-foreground">
              {(order as any)?.customer_name || 'Sem cliente'} • {elapsedSince(order?.created_at)} • {brl(Number(order?.total || 0))}
            </p>
          </div>
          {!!rodizios?.some(r => r.active) && table?.id && (
            <Button variant={rodizio ? 'default' : 'outline'} className="h-12 gap-2 rounded-2xl"
              onClick={() => setRodizioForm({
                id: rodizio?.id ?? rodizios.find(r => r.active)!.id,
                adults: table?.rodizio_adults ?? Math.max(Number(table?.capacity) || 1, 1),
                children: table?.rodizio_children ?? 0,
              })}>
              <UtensilsCrossed className="h-5 w-5" /> {rodizio ? `Rodízio ${rodizio.name}` : 'Rodízio'}
            </Button>
          )}
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
                {inRodizio(item)
                  ? <div className="mt-1 flex items-center gap-2"><Badge className="text-[11px]">Incluso no rodízio</Badge><span className="text-xs text-muted-foreground line-through">{brl(Number(item.price))}</span></div>
                  : <div className="mt-1 text-base font-bold text-primary">{brl(Number(item.price))}{(item as any).sold_by_weight ? '/kg' : ''}</div>}
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
                {item.options_text && <div className="truncate text-[11px] text-primary">{item.options_text}</div>}
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

      <WeightDialog item={weighing} onClose={() => setWeighing(null)} onConfirm={(kg, total) => {
        setCart(prev => [...prev, {
          key: `${weighing.id}-${Date.now()}`, menu_item_id: weighing.id, name: weighing.name, price: total, quantity: 1,
          notes: '', weight_kg: kg, options_text: `${kg.toFixed(3).replace('.', ',')} kg`,
        }]);
        setWeighing(null);
      }} />

      <OptionPicker item={picking} groups={picking ? optionMap?.get(picking.id) ?? [] : []} free={picking ? inRodizio(picking) : false}
        onClose={() => setPicking(null)} onConfirm={p => { addPicked(picking, p); setPicking(null); }} />

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

      <Dialog open={!!rodizioForm} onOpenChange={o => !o && setRodizioForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rodízio • Mesa {table?.number}</DialogTitle></DialogHeader>
          {rodizioForm && (() => {
            const r = rodizios?.find(x => x.id === rodizioForm.id);
            const total = r ? rodizioForm.adults * Number(r.price_adult) + rodizioForm.children * Number(r.price_child ?? r.price_adult) : 0;
            const counter = (label: string, k: 'adults' | 'children') => (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-9 w-9 rounded-lg" aria-label={`Menos ${label}`}
                    onClick={() => setRodizioForm({ ...rodizioForm, [k]: Math.max(rodizioForm[k] - 1, 0) })}><Minus className="h-4 w-4" /></Button>
                  <span className="w-8 text-center text-lg font-semibold">{rodizioForm[k]}</span>
                  <Button size="icon" variant="outline" className="h-9 w-9 rounded-lg" aria-label={`Mais ${label}`}
                    onClick={() => setRodizioForm({ ...rodizioForm, [k]: rodizioForm[k] + 1 })}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            );
            return (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rodízio</Label>
                  <Select value={rodizioForm.id} onValueChange={id => setRodizioForm({ ...rodizioForm, id })}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rodizios?.filter(x => x.active || x.id === rodizio?.id).map(x => (
                        <SelectItem key={x.id} value={x.id}>{x.name} · {brl(Number(x.price_adult))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {counter('Adultos', 'adults')}
                {r?.price_child != null && counter(`Crianças (${brl(Number(r.price_child))})`, 'children')}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cobrança na comanda</span><b>{brl(total)}</b></div>
                <p className="text-[11px] text-muted-foreground">
                  No QR e no tablet da mesa só aparecem os pratos deste rodízio. Para pedir algo por fora, o cliente chama o garçom.
                </p>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:justify-between">
            {rodizio ? (
              <Button variant="outline" className="rounded-xl text-destructive" disabled={endRodizio.isPending} onClick={() => endRodizio.mutate()}>
                Encerrar rodízio
              </Button>
            ) : <span />}
            <Button className="rounded-xl" disabled={saveRodizio.isPending} onClick={() => rodizioForm && saveRodizio.mutate(rodizioForm)}>
              {saveRodizio.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rodizio ? 'Atualizar' : 'Iniciar rodízio'}
            </Button>
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
