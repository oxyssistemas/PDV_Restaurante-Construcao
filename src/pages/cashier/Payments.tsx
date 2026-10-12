import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discountLabel } from '@/lib/promotions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, ReceiptText, Banknote, CreditCard, Smartphone, Users, Search, MoreHorizontal, Wallet, Bike, Printer, Plus, Trash2, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { authorLabel } from '@/lib/orders';
import { printReceipt } from '@/lib/printing';
import { usePrinterSettings } from '@/hooks/usePrinterSettings';
import { logAudit } from '@/lib/audit';
import DeliverySaleDialog from '@/components/delivery/DeliverySaleDialog';
import { couvertOf, minConsumptionOf, percentLabel, serviceFeeOf, useServiceSettings } from '@/lib/serviceCharge';
import SplitBillDialog from '@/components/cashier/SplitBillDialog';
import { PUBLIC_ORIGIN } from '@/lib/native';
import { IS_DEDICATED } from '@/lib/central';

const methods = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote },
  { value: 'credit_card', label: 'Crédito', icon: CreditCard },
  { value: 'debit_card', label: 'Débito', icon: CreditCard },
  { value: 'pix', label: 'PIX', icon: Smartphone },
];

const methodLabel = (v: string) => (v === 'cashback' ? 'Cashback' : methods.find(m => m.value === v)?.label || v);

/** Saldo de fidelidade do cliente (pelo telefone). */
type LoyaltyInfo = {
  found: boolean; enabled: boolean; mode: string | null; phone?: string; name?: string | null;
  cashback: number; points: number; stamps: number; stamps_required?: number; cashback_percent?: number;
};

interface PayLine { id: string; method: string; amount: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function Payments() {
  const { user, currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const { getConfig } = usePrinterSettings(restaurantId);
  const queryClient = useQueryClient();

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [lines, setLines] = useState<PayLine[]>([]);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [search, setSearch] = useState('');
  const [deliverySaleOpen, setDeliverySaleOpen] = useState(false);
  const { data: service } = useServiceSettings(restaurantId);
  const { data: feedback } = useQuery({
    queryKey: ['feedback-settings', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => (await supabase.from('feedback_settings').select('enabled, print_on_receipt').eq('restaurant_id', restaurantId!).maybeSingle()).data,
  });
  const [serviceOn, setServiceOn] = useState(true);
  const [couvertOn, setCouvertOn] = useState(true);
  const [people, setPeople] = useState('');
  const [phone, setPhone] = useState('');
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

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

  /** Comandas abertas + total já pago em cada uma (permite pagamento parcial). */
  const { data: openOrders } = useQuery({
    queryKey: ['cashier-open-orders', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, total, status, customer_name, created_at, created_by_name, created_by_role, service_fee, couvert_total, people_count, customer_phone, public_token, discount, promo_labels, coupon_code, min_consumption_total, card_code')
        .eq('restaurant_id', restaurantId!)
        .is('archived_at', null)
        .in('status', ['pending', 'preparing', 'ready', 'delivered'])
        .order('created_at');
      if (error) throw error;
      const ids = (data || []).map(o => o.id);
      if (!ids.length) return [];
      const { data: paid } = await supabase.from('payments').select('order_id, amount').in('order_id', ids);
      const paidMap = new Map<string, number>();
      (paid || []).forEach(p => paidMap.set(p.order_id, (paidMap.get(p.order_id) || 0) + Number(p.amount)));
      return (data || []).map(o => ({ ...o, paid: round2(paidMap.get(o.id) || 0) }));
    },
  });

  const tableOrders = useMemo(
    () => (openOrders || []).filter(o => o.table_id === selectedTableId),
    [openOrders, selectedTableId]
  );
  const orderIds = tableOrders.map(o => o.id);

  const { data: items } = useQuery({
    queryKey: ['cashier-table-items', orderIds.join(',')],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, order_id, quantity, unit_price, status, options_text, menu_items(name)')
        .in('order_id', orderIds);
      if (error) throw error;
      return (data || []).filter(i => i.status !== 'cancelled');
    },
  });

  const itemsTotal = (id: string) =>
    round2((items || []).filter(i => i.order_id === id).reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0));

  // taxa de serviço e couvert: o valor gravado na comanda vale; sem valor gravado, calcula com as opções do caixa
  const couvertOrderId = tableOrders.find(o => o.couvert_total != null)?.id ?? tableOrders[0]?.id;
  const peopleCount = people === '' ? (tables?.find(t => t.id === selectedTableId)?.capacity ?? 0) : Math.max(0, parseInt(people) || 0);
  // desconto das promoções (happy hour, leve X pague Y, cupom), calculado no banco
  const discountOf = (id: string) => Number(tableOrders.find(x => x.id === id)?.discount || 0);
  const serviceOf = (id: string) => {
    const o = tableOrders.find(x => x.id === id);
    if (o?.service_fee != null) return Number(o.service_fee);
    return serviceOn ? serviceFeeOf(Math.max(0, itemsTotal(id) - discountOf(id)), service) : 0;
  };
  const couvertFor = (id: string) => {
    if (id !== couvertOrderId) return 0;
    const o = tableOrders.find(x => x.id === id);
    if (o?.couvert_total != null) return Number(o.couvert_total);
    return couvertOn ? couvertOf(peopleCount, service) : 0;
  };
  // consumação mínima da mesa (por pessoa): cobrada na mesma comanda do couvert
  const minConsumptionFor = (id: string) => {
    if (id !== couvertOrderId) return 0;
    const o = tableOrders.find(x => x.id === id);
    if (o?.min_consumption_total != null) return Number(o.min_consumption_total);
    const consumed = tableOrders.reduce((sum, x) => sum + itemsTotal(x.id) - discountOf(x.id), 0);
    return minConsumptionOf(peopleCount, consumed, service);
  };
  const orderTotal = (id: string) => round2(itemsTotal(id) + serviceOf(id) + couvertFor(id) + minConsumptionFor(id) - discountOf(id));

  /** Comandas com saldo em aberto na mesa. */
  const pendingOrders = useMemo(
    () => tableOrders.filter(o => orderTotal(o.id) - o.paid > 0.009 || !items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableOrders, items]
  );

  // telefone já gravado na comanda (pedido de delivery, cliente identificado antes)
  useEffect(() => {
    const known = tableOrders.find(o => o.customer_phone)?.customer_phone;
    if (known && !phone) { setPhone(known); lookupLoyalty(known); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId, tableOrders.length]);

  // seleciona automaticamente todas as comandas com saldo ao trocar de mesa
  useEffect(() => {
    // comanda achada pelo cartão: só ela fica marcada
    if (pendingCard.current && tableOrders.some(o => o.id === pendingCard.current)) { setSelectedOrderIds([pendingCard.current]); pendingCard.current = null; return; }
    setSelectedOrderIds(tableOrders.filter(o => orderTotal(o.id) - o.paid > 0.009).map(o => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId, items]);

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

  const selectedOrders = tableOrders.filter(o => selectedOrderIds.includes(o.id));
  const selectedTotal = round2(selectedOrders.reduce((s, o) => s + orderTotal(o.id), 0));
  const selectedItems = round2(selectedOrders.reduce((s, o) => s + itemsTotal(o.id), 0));
  const selectedService = round2(selectedOrders.reduce((s, o) => s + serviceOf(o.id), 0));
  const selectedDiscount = round2(selectedOrders.reduce((s, o) => s + discountOf(o.id), 0));
  const selectedMinimum = round2(selectedOrders.reduce((s, o) => s + minConsumptionFor(o.id), 0));
  const selectedDiscountLabel = Array.from(new Set(selectedOrders.filter(o => Number(o.discount) > 0).map(o => discountLabel(o)))).join(' · ');
  const selectedCouvert = round2(selectedOrders.reduce((s, o) => s + couvertFor(o.id), 0));
  const serviceLocked = selectedOrders.some(o => o.service_fee != null);
  const couvertLocked = selectedOrders.some(o => o.id === couvertOrderId && o.couvert_total != null);
  const selectedPaid = round2(selectedOrders.reduce((s, o) => s + o.paid, 0));
  const dueNow = round2(Math.max(0, selectedTotal - selectedPaid));

  const linesTotal = round2(lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0));
  const remaining = round2(dueNow - linesTotal);
  const hasCash = lines.some(l => l.method === 'cash');
  const received = parseFloat(receivedAmount) || 0;
  const cashLinesTotal = round2(lines.filter(l => l.method === 'cash').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0));
  const change = hasCash && received > 0 ? round2(Math.max(0, received - cashLinesTotal)) : 0;

  // divisão da conta: o próximo pagamento usa o valor da parte escolhida
  const [splitOpen, setSplitOpen] = useState(false);
  const [nextAmount, setNextAmount] = useState<{ amount: number; label: string } | null>(null);
  const addLine = (m: string) => {
    const rest = round2(dueNow - linesTotal);
    const amount = nextAmount ? Math.min(nextAmount.amount, rest) : rest;
    setNextAmount(null);
    setLines(prev => [
      ...prev,
      { id: crypto.randomUUID(), method: m, amount: amount > 0 ? amount.toFixed(2) : '' },
    ]);
  };

  const resetPayment = () => { setLines([]); setReceivedAmount(''); setServiceOn(true); setCouvertOn(true); setPeople(''); setPhone(''); setLoyalty(null); };

  const lookupLoyalty = async (value = phone) => {
    if (value.replace(/\D/g, '').length < 10) { setLoyalty(null); return; }
    setLookingUp(true);
    const { data, error } = await supabase.rpc('loyalty_lookup', { _phone: value });
    setLookingUp(false);
    if (error) { setLoyalty(null); toast.error('Não foi possível consultar a fidelidade agora.'); return; }
    setLoyalty(data as unknown as LoyaltyInfo);
  };
  const cashbackAvailable = loyalty?.enabled && loyalty.mode === 'cashback' ? Number(loyalty.cashback) : 0;
  const cashbackLines = round2(lines.filter(l => l.method === 'cashback').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0));

  const toggleOrder = (id: string) =>
    setSelectedOrderIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const pay = useMutation({
    mutationFn: async () => {
      if (!selectedTableId) throw new Error('Selecione uma mesa');
      if (!selectedOrders.length) throw new Error('Selecione ao menos uma comanda');
      if (linesTotal <= 0) throw new Error('Informe ao menos uma forma de pagamento');
      if (linesTotal - dueNow > 0.009) throw new Error('Valor informado maior que o saldo devedor');
      if (cashbackLines > 0.009 && cashbackLines - cashbackAvailable > 0.009) throw new Error('Cashback maior que o saldo do cliente');

      // cliente identificado: fica na comanda (acumula fidelidade quando a conta fecha e permite usar o cashback)
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        for (const o of selectedOrders) {
          if ((o.customer_phone ?? '').replace(/\D/g, '').endsWith(digits.slice(-10))) continue;
          const patch: { customer_phone: string; customer_name?: string } = { customer_phone: phone.trim() };
          if (!o.customer_name && loyalty?.name) patch.customer_name = loyalty.name;
          const { error } = await supabase.from('orders').update(patch).eq('id', o.id);
          if (error) throw error;
        }
      } else if (cashbackLines > 0) throw new Error('Informe o telefone do cliente para usar o cashback');

      // grava a taxa de serviço e o couvert da conta (ficam fixos a partir do primeiro pagamento)
      for (const o of selectedOrders) {
        const patch: { service_fee?: number; couvert_total?: number; people_count?: number; min_consumption_total?: number } = {};
        if (o.service_fee == null) patch.service_fee = serviceOf(o.id);
        if (o.id === couvertOrderId && o.couvert_total == null) { patch.couvert_total = couvertFor(o.id); patch.people_count = peopleCount; }
        if (o.id === couvertOrderId && o.min_consumption_total == null) patch.min_consumption_total = minConsumptionFor(o.id);
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('orders').update(patch).eq('id', o.id);
          if (error) throw error;
        }
      }

      // saldo devedor por comanda (ordem de criação)
      const balances = selectedOrders.map(o => ({ id: o.id, due: round2(orderTotal(o.id) - o.paid) })).filter(b => b.due > 0.009);
      let changeLeft = change;

      for (const line of lines) {
        let amount = round2(parseFloat(line.amount) || 0);
        if (amount <= 0) continue;
        for (const b of balances) {
          if (amount <= 0.009) break;
          if (b.due <= 0.009) continue;
          const apply = round2(Math.min(amount, b.due));
          const { error } = await supabase.from('payments').insert({
            order_id: b.id,
            restaurant_id: restaurantId!,
            cash_register_id: activeRegister?.id || null,
            method: line.method as any,
            amount: apply,
            change_amount: line.method === 'cash' ? changeLeft : 0,
            user_id: user!.id,
          });
          if (error) throw error;
          if (line.method === 'cash') changeLeft = 0;
          b.due = round2(b.due - apply);
          amount = round2(amount - apply);
        }
      }

      // fecha comandas totalmente pagas
      const settled = balances.filter(b => b.due <= 0.009).map(b => b.id);
      if (settled.length) {
        for (const id of settled) {
          await supabase.from('orders').update({ status: 'delivered' as any, total: orderTotal(id) }).eq('id', id);
        }
      }

      // libera a mesa somente quando não sobrar saldo em nenhuma comanda
      const stillOpen = tableOrders.some(o => {
        const due = round2(orderTotal(o.id) - o.paid);
        const settledHere = balances.find(b => b.id === o.id);
        const left = settledHere ? settledHere.due : due;
        return left > 0.009;
      });

      if (!stillOpen) {
        const { error: tableError } = await supabase
          .from('restaurant_tables')
          .update({ status: 'free' as const })
          .eq('id', selectedTableId);
        if (tableError) throw tableError;
      }

      await logAudit({
        restaurantId: restaurantId!,
        role: currentRole?.role,
        action: 'create',
        entity: 'payment',
        entityId: selectedOrders[0]?.id,
        summary: `Pagamento de R$ ${linesTotal.toFixed(2)} • ${lines.map(l => `${methodLabel(l.method)} R$ ${(parseFloat(l.amount) || 0).toFixed(2)}`).join(' + ')} • ${selectedOrders.length} comanda(s)`,
      });

      return { fullyPaid: !stillOpen, partial: remaining > 0.009 };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cashier-open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-tables'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-today-payments'] });
      toast.success(
        res?.fullyPaid ? 'Pagamento registrado! Mesa liberada.' : 'Pagamento parcial registrado. Saldo permanece em aberto.'
      );
      resetPayment();
      if (res?.fullyPaid) setSelectedTableId(null);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao processar pagamento.'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        if (linesTotal > 0 && selectedOrders.length && !pay.isPending) pay.mutate();
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
  // busca por mesa ou pelo número do cartão/pulseira da comanda
  const cardHit = search.trim() ? (openOrders || []).find(o => (o.card_code || '').toUpperCase() === search.trim().toUpperCase()) : undefined;
  const visibleTables = (tables || []).filter(t => String(t.number).includes(search.trim()) || t.id === cardHit?.table_id);
  const pendingCard = useRef<string | null>(null);
  useEffect(() => {
    if (!cardHit?.table_id) return;
    pendingCard.current = cardHit.id;
    setSelectedTableId(cardHit.table_id);
    setSelectedOrderIds([cardHit.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardHit?.id]);

  const handlePrintReceipt = (width: '58mm' | '80mm' = '80mm') => {
    if (!selectedOrders.length) return;
    const first = selectedOrders[0] as any;
    printReceipt({
      restaurantName: restaurant?.name || 'Oxys Restaurante',
      width,
      order: {
        id: first.id,
        created_at: first.created_at,
        customer_name: selectedOrders.map((o: any, i) => o.customer_name || `Comanda ${i + 1}`).join(' / '),
        table_number: selectedTable?.number ?? null,
        total: round2(selectedTotal + selectedDiscount),
        discount: selectedDiscount,
        discount_label: selectedDiscountLabel,
        min_consumption_total: selectedMinimum,
        service_fee: selectedService,
        service_label: service?.service_enabled ? `Servico (${percentLabel(service.service_percent)})` : 'Servico',
        couvert: selectedCouvert,
        couvert_label: service?.couvert_label,
        created_by_name: first.created_by_name,
        created_by_role: first.created_by_role,
      },
      items: (items || [])
        .filter(i => selectedOrderIds.includes(i.order_id))
        .map(i => ({
          name: `${(i as any).menu_items?.name || 'Item'}${i.options_text ? ` (${i.options_text})` : ''}`,
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
        })),
      payments: lines
        .filter(l => (parseFloat(l.amount) || 0) > 0)
        .map(l => ({ method: l.method, amount: parseFloat(l.amount) || 0 })),
      change,
      config: getConfig('receipt'),
      reviewUrl: feedback?.enabled !== false && feedback?.print_on_receipt !== false && first.public_token
        ? `${PUBLIC_ORIGIN}/avaliar/${first.public_token}${IS_DEDICATED ? `?r=${restaurantId}` : ''}` : null,
    });
    logAudit({
      restaurantId: restaurantId!,
      role: currentRole?.role,
      action: 'print',
      entity: 'payment',
      entityId: first.id,
      summary: `Recibo impresso • Mesa ${selectedTable?.number ?? '-'} • R$ ${selectedTotal.toFixed(2)}`,
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
              {selectedTable
                ? `${selectedTable.capacity} pessoas • ${tableOrders.length} comanda(s) • ${selectedOrders.length} selecionada(s)`
                : 'Nenhuma mesa selecionada'}
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
        ) : !pendingOrders.length ? (
          <div className="flex h-full min-h-[140px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Nenhuma comanda em aberto nesta mesa.
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {pendingOrders.map((order, idx) => {
                const orderItems = (items || []).filter(i => i.order_id === order.id);
                const oTotal = orderTotal(order.id);
                const due = round2(oTotal - order.paid);
                const checked = selectedOrderIds.includes(order.id);
                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'rounded-xl border p-3 transition-colors',
                      checked ? 'border-primary/60 bg-primary/5' : 'border-border bg-muted/10'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleOrder(order.id)} />
                        <span className="truncate text-sm font-semibold">
                          {order.card_code ? `#${order.card_code} · ` : ''}{order.customer_name || `Comanda ${idx + 1}`}
                        </span>
                      </label>
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        R$ {due.toFixed(2)}
                      </span>
                    </div>
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      Lançado por {authorLabel(order as any)}
                      {order.paid > 0 && (
                        <span className="ml-1 text-[hsl(var(--success))]">
                          • já pago R$ {order.paid.toFixed(2)} de R$ {oTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {orderItems.length ? (
                      <ul className="space-y-1 text-sm">
                        {orderItems.map(i => (
                          <li key={i.id} className="flex justify-between gap-2">
                            <span className="truncate">{i.quantity}x {(i as any).menu_items?.name}{i.options_text ? ` (${i.options_text})` : ''}</span>
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
          <div className="flex justify-between text-muted-foreground"><span>Consumo selecionado</span><span>R$ {selectedItems.toFixed(2)}</span></div>
          {(service?.service_enabled || selectedService > 0) && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch checked={serviceLocked ? selectedService > 0 : serviceOn} disabled={serviceLocked || !selectedOrders.length}
                  onCheckedChange={setServiceOn} aria-label="Cobrar taxa de serviço" />
                Taxa de serviço{service?.service_enabled ? ` (${percentLabel(service.service_percent)})` : ''}
              </label>
              <span>R$ {selectedService.toFixed(2)}</span>
            </div>
          )}
          {(service?.couvert_enabled || selectedCouvert > 0) && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch checked={couvertLocked ? selectedCouvert > 0 : couvertOn} disabled={couvertLocked || !selectedOrders.length}
                  onCheckedChange={setCouvertOn} aria-label="Cobrar couvert" />
                {service?.couvert_label || 'Couvert'}
                {!couvertLocked && couvertOn && selectedOrders.some(o => o.id === couvertOrderId) && (
                  <Input type="number" min="0" step="1" className="h-7 w-16 rounded-lg px-2 text-xs" aria-label="Pessoas"
                    value={people === '' ? String(peopleCount) : people} onChange={e => setPeople(e.target.value)} />
                )}
                {couvertLocked
                  ? <span className="text-xs">{tableOrders.find(o => o.id === couvertOrderId)?.people_count ?? 0} pessoa(s)</span>
                  : couvertOn && selectedOrders.some(o => o.id === couvertOrderId) && <span className="text-xs">pessoa(s)</span>}
              </label>
              <span>R$ {selectedCouvert.toFixed(2)}</span>
            </div>
          )}
          {selectedMinimum > 0 && (
            <div className="flex justify-between text-muted-foreground"><span>Consumação mínima (complemento)</span><span>R$ {selectedMinimum.toFixed(2)}</span></div>
          )}
          {selectedDiscount > 0 && (
            <div className="flex justify-between gap-2 text-[hsl(var(--success))]">
              <span className="min-w-0 truncate">Desconto · {selectedDiscountLabel}</span><span className="shrink-0">- R$ {selectedDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground"><span>Já pago</span><span>R$ {selectedPaid.toFixed(2)}</span></div>
        </div>

        <div className="flex items-end justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Saldo devedor</span>
          <span className="text-3xl font-bold text-primary">R$ {dueNow.toFixed(2)}</span>
        </div>

        <div className="space-y-1.5 rounded-xl border border-border p-2.5">
          <Label className="flex items-center gap-1.5 text-xs"><Gift className="h-3.5 w-3.5 text-primary" /> Cliente (fidelidade e cashback)</Label>
          <div className="flex gap-2">
            <Input className="h-9 rounded-lg" inputMode="tel" placeholder="Telefone com DDD" value={phone}
              onChange={e => { setPhone(e.target.value); if (loyalty) setLoyalty(null); }}
              onBlur={() => lookupLoyalty()} onKeyDown={e => { if (e.key === 'Enter') lookupLoyalty(); }} disabled={!selectedOrders.length} />
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => lookupLoyalty()} disabled={lookingUp || !selectedOrders.length}>
              {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
            </Button>
          </div>
          {loyalty && (
            <p className="text-xs text-muted-foreground">
              {!loyalty.enabled ? 'Programa de fidelidade desligado.'
                : !loyalty.found ? 'Cliente novo no programa: acumula ao fechar a conta.'
                : <>
                    <b className="text-foreground">{loyalty.name || 'Cliente'}</b>
                    {loyalty.mode === 'cashback' && <> · saldo de cashback <b className="text-[hsl(var(--success))]">R$ {Number(loyalty.cashback).toFixed(2)}</b></>}
                    {loyalty.mode === 'points' && <> · {Number(loyalty.points)} pontos</>}
                    {loyalty.mode === 'stamps' && <> · {loyalty.stamps}/{loyalty.stamps_required} selos</>}
                  </>}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Adicionar forma de pagamento</Label>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={!selectedOrders.length || dueNow <= 0}
              onClick={() => setSplitOpen(true)}>Dividir conta</Button>
          </div>
          {nextAmount && (
            <p className="mt-1 text-xs text-primary">Próximo pagamento: R$ {nextAmount.amount.toFixed(2)} ({nextAmount.label}) — escolha a forma abaixo.
              <button type="button" className="ml-1 underline" onClick={() => setNextAmount(null)}>cancelar</button></p>
          )}
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {methods.map(m => (
              <button
                key={m.value}
                onClick={() => addLine(m.value)}
                disabled={!selectedOrders.length}
                className={cn(
                  'pdv-ripple flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-sm font-medium text-muted-foreground transition-all duration-200',
                  'hover:border-primary/40 hover:text-foreground disabled:opacity-40'
                )}
              >
                <m.icon className="h-4 w-4" /> {m.label}
                <Plus className="ml-auto h-3.5 w-3.5" />
              </button>
            ))}
            {cashbackAvailable > 0.009 && (
              <button
                onClick={() => {
                  const rest = round2(dueNow - linesTotal);
                  const amount = Math.min(rest, round2(cashbackAvailable - cashbackLines));
                  if (amount <= 0) return;
                  setLines(prev => [...prev, { id: crypto.randomUUID(), method: 'cashback', amount: amount.toFixed(2) }]);
                }}
                disabled={!selectedOrders.length || cashbackLines >= cashbackAvailable - 0.009}
                className="pdv-ripple col-span-2 flex items-center gap-2 rounded-xl border border-[hsl(var(--success))]/40 px-3 py-3 text-sm font-medium text-[hsl(var(--success))] transition-all duration-200 hover:bg-[hsl(var(--success))]/10 disabled:opacity-40"
              >
                <Gift className="h-4 w-4" /> Usar cashback (R$ {round2(cashbackAvailable - cashbackLines).toFixed(2)} disponível)
                <Plus className="ml-auto h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!!lines.length && (
          <div className="space-y-2">
            {lines.map(l => (
              <div key={l.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <span className="w-24 shrink-0 truncate text-xs font-medium">{methodLabel(l.method)}</span>
                <Input
                  type="number" min="0" step="0.01"
                  className="h-9 rounded-lg"
                  value={l.amount}
                  onChange={e => setLines(prev => prev.map(x => (x.id === l.id ? { ...x, amount: e.target.value } : x)))}
                  placeholder="0,00"
                />
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive"
                  onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total informado</span>
              <span className="font-semibold">R$ {linesTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Restante após este pagamento</span>
              <span className={cn('font-semibold', remaining > 0.009 ? 'text-amber-500' : 'text-[hsl(var(--success))]')}>
                R$ {Math.max(0, remaining).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {hasCash && (
          <div className="space-y-1.5">
            <Label className="text-xs">Valor recebido em dinheiro (R$)</Label>
            <Input
              type="number" min="0" step="0.01"
              className="rounded-xl"
              value={receivedAmount}
              onChange={e => setReceivedAmount(e.target.value)}
              placeholder={cashLinesTotal.toFixed(2)}
            />
            {received > 0 && (
              <p className="text-sm font-semibold text-[hsl(var(--success))]">Troco: R$ {change.toFixed(2)}</p>
            )}
          </div>
        )}

        <Button
          className="pdv-ripple h-14 w-full gap-2 rounded-2xl text-base font-semibold"
          disabled={
            !selectedOrders.length || linesTotal <= 0 || pay.isPending ||
            linesTotal - dueNow > 0.009 ||
            (hasCash && received > 0 && received < cashLinesTotal)
          }
          onClick={() => pay.mutate()}
        >
          {pay.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
          {remaining > 0.009 ? 'Registrar pagamento parcial' : 'Finalizar pagamento'}
          <span className="ml-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">F4</span>
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs" disabled={!selectedOrders.length}
            onClick={() => handlePrintReceipt('80mm')}>
            <Printer className="h-4 w-4" /> Recibo 80mm
          </Button>
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-xs" disabled={!selectedOrders.length}
            onClick={() => handlePrintReceipt('58mm')}>
            <Printer className="h-4 w-4" /> Recibo 58mm
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] gap-4 p-4 md:-m-6 md:h-[calc(100%+3rem)] md:p-6">
      <div className="pdv-scroll flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
            <p className="text-xs text-muted-foreground">PDV • Recebimento parcial, por comanda e liberação de mesas</p>
          </div>
          <div className="relative min-w-[200px] flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-2xl pl-9"
              placeholder="Buscar mesa ou nº do cartão..."
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
                  onClick={() => { setSelectedTableId(t.id); resetPayment(); }}
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
      <SplitBillDialog open={splitOpen} onOpenChange={setSplitOpen} due={round2(dueNow - linesTotal)} total={selectedTotal} itemsTotal={selectedItems}
        items={(items || []).filter(i => selectedOrderIds.includes(i.order_id)).map(i => ({
          id: i.id, name: `${(i as any).menu_items?.name || 'Item'}${i.options_text ? ` (${i.options_text})` : ''}`, quantity: i.quantity, unit_price: Number(i.unit_price),
        }))}
        onApply={(amount, label) => setNextAmount({ amount, label })} />

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
