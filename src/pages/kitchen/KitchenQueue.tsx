import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Clock, Flame, CheckCircle2, ChefHat, Printer, LogOut, Search, Bike,
  UtensilsCrossed, X, Timer, Wifi, RefreshCw, ArrowRightLeft, Ban, User, AlertTriangle, Power,
} from 'lucide-react';
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { authorLabel } from '@/lib/orders';
import { cn } from '@/lib/utils';
import logo from '@/assets/oxys-logo.png.asset.json';
import { OrderTicketCard, timeTone, type KdsTicket, type KdsItem } from '@/components/kitchen/OrderTicketCard';

type ColumnKey = 'new' | 'preparing' | 'ready' | 'waiting';

const columns: { key: ColumnKey; label: string; tone: string; dot: string }[] = [
  { key: 'new', label: 'NOVOS', tone: 'text-primary border-primary/40 bg-primary/10', dot: 'bg-primary' },
  { key: 'preparing', label: 'EM PREPARO', tone: 'text-amber-400 border-amber-500/40 bg-amber-500/10', dot: 'bg-amber-400' },
  { key: 'ready', label: 'PRONTOS', tone: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', dot: 'bg-emerald-400' },
  { key: 'waiting', label: 'AGUARDANDO', tone: 'text-muted-foreground border-border bg-muted/30', dot: 'bg-muted-foreground' },
];

const originFilters = [
  { key: 'all', label: 'Todos' },
  { key: 'dine_in', label: 'Salão' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'takeaway', label: 'Balcão' },
];

export default function KitchenQueue() {
  const { currentRole, signOut } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(() => new Date());
  const [lastSync, setLastSync] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState<KdsTicket | null>(null);
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null);

  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); setClock(new Date()); }, 1000);
    return () => clearInterval(t);
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(ctx.currentTime + 0.2);
      }, 180);
    } catch {}
  }, []);

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ['kitchen-session', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kitchen_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const kitchenOpen = !!session;

  const { data: orderItems, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['kitchen-queue', restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('*, menu_items(name, menu_categories(name)), orders!inner(id, table_id, restaurant_id, order_type, customer_name, created_by_name, created_by_role, archived_at, restaurant_tables(number))')
        .eq('orders.restaurant_id', restaurantId!)
        .is('orders.archived_at', null)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });


  useEffect(() => { if (dataUpdatedAt) setLastSync(new Date(dataUpdatedAt)); }, [dataUpdatedAt]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('kitchen-queue-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () => {
        playNotificationSound();
        toast.info('🆕 Novo pedido recebido!', { duration: 4000 });
        queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, queryClient, playNotificationSound]);

  const updateStatus = useMutation({
    mutationFn: async ({ itemIds, newStatus }: { itemIds: string[]; newStatus: string }) => {
      const { error } = await supabase
        .from('order_items')
        .update({ status: newStatus as any })
        .in('id', itemIds);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      if (vars.newStatus === 'ready') {
        toast.success('✅ Item marcado como pronto — garçom notificado!');
      } else if (vars.newStatus === 'preparing') {
        toast.success('Itens em preparo!');
      }
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  });

  const tickets = useMemo<KdsTicket[]>(() => {
    const map = new Map<string, KdsTicket>();
    orderItems?.forEach((raw) => {
      const item = raw as any;
      const order = item.orders;
      const key = order?.id || 'unknown';
      const isDelivery = order?.order_type === 'delivery';
      if (!map.has(key)) {
        map.set(key, {
          key,
          orderId: key,
          isDelivery,
          title: isDelivery
            ? `Delivery — ${order?.customer_name || 'Cliente'}`
            : `Mesa ${order?.restaurant_tables?.number ?? '?'}${order?.customer_name ? ` — ${order.customer_name}` : ''}`,
          waiter: authorLabel(order || {}),
          createdAt: item.created_at,
          items: [],
          column: 'new',
        });
      }
      const t = map.get(key)!;
      const kdsItem: KdsItem = {
        id: item.id,
        quantity: item.quantity,
        notes: item.notes,
        status: item.status,
        created_at: item.created_at,
        name: item.menu_items?.name ?? 'Item',
        sector: item.menu_items?.menu_categories?.name ?? 'Outros',
      };
      t.items.push(kdsItem);
      if (new Date(item.created_at) < new Date(t.createdAt)) t.createdAt = item.created_at;
    });

    return Array.from(map.values()).map((t) => {
      const statuses = t.items.map((i) => i.status);
      const allReady = statuses.every((s) => s === 'ready');
      const anyPreparing = statuses.includes('preparing');
      const anyReady = statuses.includes('ready');
      const column: ColumnKey = allReady ? 'ready' : anyPreparing ? 'preparing' : anyReady ? 'waiting' : 'new';
      return { ...t, column };
    });
  }, [orderItems]);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    tickets.forEach((t) => t.items.forEach((i) => counts.set(i.sector, (counts.get(i.sector) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (origin !== 'all') {
        const isDelivery = t.isDelivery;
        if (origin === 'delivery' && !isDelivery) return false;
        if (origin !== 'delivery' && isDelivery) return false;
        if (origin === 'takeaway' && !t.title.toLowerCase().includes('balcão')) return false;
      }
      if (sector !== 'all' && !t.items.some((i) => i.sector === sector)) return false;
      if (q && !(`${t.title} ${t.waiter} ${t.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tickets, search, sector, origin]);

  const byColumn = useMemo(() => {
    const out: Record<ColumnKey, KdsTicket[]> = { new: [], preparing: [], ready: [], waiting: [] };
    filtered.forEach((t) => out[t.column].push(t));
    return out;
  }, [filtered]);

  const selected = useMemo(() => filtered.find((t) => t.key === selectedKey) || null, [filtered, selectedKey]);

  const lateCount = useMemo(
    () => tickets.filter((t) => now - new Date(t.createdAt).getTime() >= 10 * 60000 && t.column !== 'ready').length,
    [tickets, now]
  );

  const moveTicket = useCallback((ticket: KdsTicket, target: ColumnKey) => {
    if (target === 'waiting') return;
    const newStatus = target === 'new' ? 'pending' : target === 'preparing' ? 'preparing' : 'ready';
    const ids = ticket.items.filter((i) => i.status !== newStatus).map((i) => i.id);
    if (!ids.length) return;
    updateStatus.mutate({ itemIds: ids, newStatus });
  }, [updateStatus]);

  const printTickets = useCallback((list: KdsTicket[]) => {
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) return;
    const body = list.map((t) => `
      <div style="border-bottom:1px dashed #000;padding:8px 0">
        <strong>${t.title}</strong><br/>
        <small>${t.waiter} — ${format(new Date(t.createdAt), 'dd/MM HH:mm', { locale: ptBR })}</small>
        <ul style="margin:6px 0 0 16px;padding:0">
          ${t.items.map((i) => `<li>${i.quantity}x ${i.name}${i.notes ? ` <em>(${i.notes})</em>` : ''}</li>`).join('')}
        </ul>
      </div>`).join('');
    win.document.write(`<html><head><title>Pedidos — Cozinha</title></head><body style="font-family:Arial;font-size:12px">
      <h3>Oxys — Portal da Cozinha</h3>${body}</body></html>`);
    win.document.close();
    win.print();
  }, []);

  const openKitchen = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sessão expirada');
      const { error } = await supabase.from('kitchen_sessions').insert({
        restaurant_id: restaurantId!,
        opened_by: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-session', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      toast.success('Cozinha aberta!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao abrir a cozinha.'),
  });

  const closeKitchen = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !session) throw new Error('Sessão expirada');

      const { data: archived, error } = await supabase
        .from('orders')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: auth.user.id,
          kitchen_session_id: session.id,
        })
        .eq('restaurant_id', restaurantId!)
        .is('archived_at', null)
        .select('id');
      if (error) throw error;

      const { error: closeError } = await supabase
        .from('kitchen_sessions')
        .update({
          closed_at: new Date().toISOString(),
          closed_by: auth.user.id,
          orders_archived: archived?.length ?? 0,
        })
        .eq('id', session.id);
      if (closeError) throw closeError;
      return archived?.length ?? 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-session', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] });
      setSelectedKey(null);
      toast.success(`Cozinha fechada — ${count} pedidos arquivados no histórico.`);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao fechar a cozinha.'),
  });

  const handleCloseKitchen = useCallback(() => {
    const pending = tickets.filter((t) => t.column !== 'ready').length;
    if (pending > 0) {
      const ok = window.confirm(
        `Existem ${pending} pedido(s) em aberto na cozinha. Fechar mesmo assim? Todos os pedidos serão arquivados no histórico.`
      );
      if (!ok) return;
    } else if (!window.confirm('Fechar a cozinha e arquivar os pedidos do expediente?')) {
      return;
    }
    closeKitchen.mutate();
  }, [tickets, closeKitchen]);


  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-[#111827] p-4 lg:flex">
        <div className="flex items-center gap-2">
          <img src={logo.url} alt="Oxys Sistemas" className="h-9 w-9 rounded-lg object-contain" />
          <div>
            <p className="text-sm font-bold leading-tight">Oxys Sistemas</p>
            <p className="flex items-center gap-1 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
            </p>
          </div>
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setores</p>
        <ScrollArea className="mt-2 flex-1">
          <div className="space-y-1 pr-2">
            <button
              onClick={() => setSector('all')}
              className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
                sector === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40')}
            >
              <span>Todos</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{tickets.length}</Badge>
            </button>
            {sectors.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setSector(name)}
                className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
                  sector === name ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40')}
              >
                <span className="truncate">{name}</span>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{count}</Badge>
              </button>
            ))}
          </div>
        </ScrollArea>

        <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => printTickets(filtered)}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir todos
        </Button>
        <Button variant="ghost" className="mt-2 w-full rounded-xl text-muted-foreground"
          onClick={async () => { await signOut(); navigate('/login'); }}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-[#111827] px-4 py-3">
          <div className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold">Portal da Cozinha</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-400">
              <Wifi className="h-3 w-3" /> Online
            </Badge>
          </div>

          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mesa, pedido, cliente, garçom…"
              className="h-10 rounded-xl pl-9"
            />
          </div>

          {kitchenOpen ? (
            <Button variant="outline" className="h-10 gap-2 rounded-xl border-destructive/40 text-destructive"
              disabled={closeKitchen.isPending} onClick={handleCloseKitchen}>
              <Power className="h-4 w-4" /> Fechar cozinha
            </Button>
          ) : (
            <Button className="h-10 gap-2 rounded-xl" disabled={openKitchen.isPending || loadingSession}
              onClick={() => openKitchen.mutate()}>
              <Power className="h-4 w-4" /> Abrir cozinha
            </Button>
          )}

          <div className="text-right">
            <p className="font-mono text-xl font-bold leading-none">{format(clock, 'HH:mm:ss')}</p>
            <p className="text-[11px] text-muted-foreground">
              {format(clock, "EEE, dd 'de' MMM", { locale: ptBR })} · sync {format(lastSync, 'HH:mm')}
            </p>
          </div>

        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {originFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setOrigin(f.key)}
              className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                origin === f.key ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {f.label}
            </button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto h-8 rounded-xl text-xs"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['kitchen-queue', restaurantId] })}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        {/* Kanban */}
        <div className="min-h-0 flex-1 overflow-x-auto">
          {isLoading || loadingSession ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !kitchenOpen ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Power className="h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-bold">Cozinha fechada</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Abra a cozinha para começar a receber pedidos. Os pedidos do expediente anterior ficam no histórico do financeiro e da gerência.
              </p>
              <Button className="mt-2 gap-2 rounded-xl" onClick={() => openKitchen.mutate()} disabled={openKitchen.isPending}>
                <Power className="h-4 w-4" /> Abrir cozinha
              </Button>
            </div>
          ) : (

            <div className="flex h-full min-w-[900px] gap-3 p-3">
              {columns.map((col) => (
                <section
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                  onDragLeave={() => setDragOver((c) => (c === col.key ? null : c))}
                  onDrop={() => { if (dragging) moveTicket(dragging, col.key); setDragging(null); setDragOver(null); }}
                  className={cn('flex min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card/40 transition-colors',
                    dragOver === col.key && 'border-primary bg-primary/5')}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                      <span className="text-xs font-bold tracking-wide">{col.label}</span>
                    </div>
                    <Badge variant="outline" className={cn('h-5 px-2 text-[11px]', col.tone)}>
                      {byColumn[col.key].length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="space-y-2 p-2">
                      <AnimatePresence mode="popLayout">
                        {byColumn[col.key].map((t) => (
                          <OrderTicketCard
                            key={t.key}
                            ticket={t}
                            now={now}
                            selected={selectedKey === t.key}
                            onSelect={(x) => setSelectedKey(x.key)}
                            onDragStart={setDragging}
                          />
                        ))}
                      </AnimatePresence>
                      {byColumn[col.key].length === 0 && (
                        <p className="py-8 text-center text-xs text-muted-foreground">Nenhum pedido</p>
                      )}
                    </div>
                  </ScrollArea>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer status bar */}
        <footer className="flex flex-wrap items-center gap-4 border-t border-border bg-[#111827] px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-primary" /> Novos: <b className="text-foreground">{byColumn.new.length}</b></span>
          <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-amber-400" /> Em preparo: <b className="text-foreground">{byColumn.preparing.length}</b></span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Prontos: <b className="text-foreground">{byColumn.ready.length}</b></span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Atrasados: <b className="text-foreground">{lateCount}</b></span>
          <span className="ml-auto flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Última sinc.: {format(lastSync, 'HH:mm:ss')}</span>
          <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online</span>
        </footer>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="flex w-[360px] shrink-0 flex-col border-l border-border bg-[#111827]"
          >
            <div className="flex items-start justify-between gap-2 border-b border-border p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-bold">
                  {selected.isDelivery ? <Bike className="h-4 w-4 text-primary" /> : <UtensilsCrossed className="h-4 w-4 text-primary" />}
                  <span className="truncate">{selected.title}</span>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" /> {selected.waiter}
                </p>
                <Badge variant="outline" className={cn('mt-2 gap-1 text-[11px]', timeTone(Math.floor((now - new Date(selected.createdAt).getTime()) / 60000)))}>
                  <Clock className="h-3 w-3" /> {Math.floor((now - new Date(selected.createdAt).getTime()) / 60000)} min · {format(new Date(selected.createdAt), 'HH:mm')}
                </Badge>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelectedKey(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2 p-4">
                {selected.items.map((i) => (
                  <div key={i.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        <span className="text-primary">{i.quantity}x</span> {i.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{i.sector}</Badge>
                    </div>
                    {i.notes && <p className="mt-1 text-xs text-amber-400">⚠ {i.notes}</p>}
                    <div className="mt-2 flex gap-2">
                      {i.status !== 'preparing' && i.status !== 'ready' && (
                        <Button size="sm" variant="outline" className="h-8 flex-1 rounded-lg text-xs"
                          onClick={() => updateStatus.mutate({ itemIds: [i.id], newStatus: 'preparing' })}>
                          <Flame className="mr-1 h-3.5 w-3.5" /> Iniciar
                        </Button>
                      )}
                      {i.status !== 'ready' && (
                        <Button size="sm" className="h-8 flex-1 rounded-lg text-xs"
                          onClick={() => updateStatus.mutate({ itemIds: [i.id], newStatus: 'ready' })}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pronto
                        </Button>
                      )}
                      {i.status === 'ready' && (
                        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-400">Pronto</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => moveTicket(selected, 'preparing')}>
                <Flame className="mr-1 h-4 w-4" /> Em preparo
              </Button>
              <Button className="h-12 rounded-xl" onClick={() => moveTicket(selected, 'ready')}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Pronto
              </Button>
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => toast.info('Transferência de pedido é feita no portal do Caixa.')}>
                <ArrowRightLeft className="mr-1 h-4 w-4" /> Transferir
              </Button>
              <Button variant="outline" className="h-12 rounded-xl text-destructive" onClick={() => toast.info('Cancelamento é feito no portal do Caixa.')}>
                <Ban className="mr-1 h-4 w-4" /> Cancelar
              </Button>
              <Button variant="secondary" className="col-span-2 h-12 rounded-xl" onClick={() => printTickets([selected])}>
                <Printer className="mr-1 h-4 w-4" /> Imprimir pedido
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
