import { NavLink, Outlet, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Bike, Map as MapIcon, DoorClosed, DoorOpen, Globe, LayoutGrid, ListOrdered, Loader2, MessageCircle, Settings2, ShoppingBag, Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SourceBadge from '@/components/delivery/SourceBadge';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ModuleKey } from '@/lib/modules';
import { ifoodStoreStatus } from '@/lib/ifood';
import { brl } from '@/lib/finance';

/** Botões do topo: cada canal do delivery tem a sua tela de configuração. */
const TABS: { to: string; label: string; module: ModuleKey; icon?: typeof Bike; source?: string; end?: boolean }[] = [
  { to: '/admin/delivery', label: 'Visão geral', module: 'delivery', icon: LayoutGrid, end: true },
  { to: '/admin/delivery/pedidos', label: 'Pedidos', module: 'delivery', icon: ListOrdered },
  { to: '/admin/delivery/mapa', label: 'Mapa e rotas', module: 'delivery', icon: MapIcon },
  { to: '/admin/delivery/loja', label: 'Loja online', module: 'online_store', source: 'site' },
  { to: '/admin/delivery/whatsapp', label: 'WhatsApp', module: 'whatsapp', source: 'whatsapp' },
  { to: '/admin/delivery/ifood', label: 'iFood', module: 'ifood', source: 'ifood' },
  { to: '/admin/delivery/99food', label: '99Food', module: 'marketplaces', source: '99food' },
  { to: '/admin/delivery/keeta', label: 'Keeta', module: 'marketplaces', source: 'keeta' },
  { to: '/admin/delivery/rappi', label: 'Rappi', module: 'marketplaces', source: 'rappi' },
  { to: '/admin/delivery/entregadores', label: 'Entregadores', module: 'couriers', icon: Bike },
];

/** Aba única do delivery no admin: botões de cada canal no topo e a tela escolhida embaixo. */
export default function DeliveryHub() {
  const { canView } = useModuleAccess();
  const tabs = TABS.filter(t => canView(t.module));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50 hover:bg-muted',
            )}
          >
            {t.source ? <SourceBadge source={t.source} /> : t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

type ChannelState = {
  key: string;
  label: string;
  source: string;
  to: string;
  module: ModuleKey;
  /** Configurado o bastante para abrir/fechar daqui. */
  ready: boolean;
  open: boolean;
  hint: string;
};

/** Visão geral: situação de cada canal, abrir/fechar um a um ou tudo de uma vez. */
export function DeliveryOverview() {
  const { currentRole } = useAuth();
  const rid = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const { canEdit } = useModuleAccess();

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-hub', rid],
    enabled: !!rid,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [store, bot, ifood, apps, orders, couriers] = await Promise.all([
        supabase.from('delivery_stores').select('enabled, is_open, slug').eq('restaurant_id', rid!).maybeSingle(),
        supabase.from('whatsapp_bot_settings').select('enabled').eq('restaurant_id', rid!).maybeSingle(),
        supabase.from('ifood_integrations').select('enabled, merchant_id, store_open, sync_store_status').eq('restaurant_id', rid!).maybeSingle(),
        supabase.from('marketplace_integrations').select('channel, enabled, store_ref').eq('restaurant_id', rid!),
        supabase.from('orders').select('source, total, delivery_fee, delivery_status, discount')
          .eq('restaurant_id', rid!).in('order_type', ['delivery', 'takeaway'])
          .gte('created_at', startOfDay(new Date()).toISOString()),
        supabase.from('couriers').select('status, active').eq('restaurant_id', rid!).eq('active', true),
      ]);
      return {
        store: store.data, bot: bot.data, ifood: ifood.data, apps: apps.data ?? [],
        orders: orders.data ?? [], couriers: couriers.data ?? [],
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['delivery-hub', rid] });
    qc.invalidateQueries({ queryKey: ['delivery-store'] });
    qc.invalidateQueries({ queryKey: ['ifood-integration', rid] });
    qc.invalidateQueries({ queryKey: ['marketplace-integrations'] });
    qc.invalidateQueries({ queryKey: ['wa-bot', rid] });
  };

  const channels: ChannelState[] = (() => {
    if (!data) return [];
    const app = (k: string) => data.apps.find(a => a.channel === k);
    const appState = (k: string, label: string): ChannelState => ({
      key: k, label, source: k, to: `/admin/delivery/${k}`, module: 'marketplaces',
      ready: !!app(k), open: !!app(k)?.enabled,
      hint: app(k) ? (app(k)?.store_ref ? `Loja ${app(k)?.store_ref}` : 'Sem id da loja') : 'Ainda não configurado',
    });
    return [
      {
        key: 'site', label: 'Loja online', source: 'site', to: '/admin/delivery/loja', module: 'online_store',
        ready: !!data.store?.enabled, open: !!data.store?.enabled && !!data.store?.is_open,
        hint: !data.store ? 'Ainda não criada' : !data.store.enabled ? 'Loja não publicada' : `/pedir/${data.store.slug}`,
      },
      {
        key: 'whatsapp', label: 'WhatsApp', source: 'whatsapp', to: '/admin/delivery/whatsapp', module: 'whatsapp',
        ready: !!data.bot, open: !!data.bot?.enabled,
        hint: data.bot ? 'Robô de atendimento' : 'Robô não configurado',
      },
      {
        key: 'ifood', label: 'iFood', source: 'ifood', to: '/admin/delivery/ifood', module: 'ifood',
        ready: !!data.ifood?.enabled && !!data.ifood?.merchant_id, open: !!data.ifood?.enabled && !!data.ifood?.store_open,
        hint: !data.ifood?.merchant_id ? 'Loja não conectada' : !data.ifood.enabled ? 'Integração desligada' : `Loja ${data.ifood.merchant_id}`,
      },
      appState('99food', '99Food'),
      appState('keeta', 'Keeta'),
      appState('rappi', 'Rappi'),
    ];
  })();

  const setOpen = async (c: ChannelState, open: boolean) => {
    if (c.key === 'site') {
      const { error } = await supabase.from('delivery_stores').update({ is_open: open }).eq('restaurant_id', rid!);
      if (error) throw error;
    } else if (c.key === 'whatsapp') {
      const { error } = await supabase.from('whatsapp_bot_settings').update({ enabled: open }).eq('restaurant_id', rid!);
      if (error) throw error;
    } else if (c.key === 'ifood') {
      await ifoodStoreStatus(rid!, open);
    } else {
      const { error } = await supabase.from('marketplace_integrations').update({ enabled: open })
        .eq('restaurant_id', rid!).eq('channel', c.key as '99food' | 'keeta' | 'rappi');
      if (error) throw error;
    }
  };

  const toggle = useMutation({
    mutationFn: ({ c, open }: { c: ChannelState; open: boolean }) => setOpen(c, open),
    onSuccess: (_d, { c, open }) => { refresh(); toast.success(`${c.label} ${open ? 'aberto' : 'fechado'}.`); },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível mudar.'),
  });

  const all = useMutation({
    mutationFn: async (open: boolean) => {
      const targets = channels.filter(c => c.ready && canEdit(c.module) && c.open !== open);
      const results = await Promise.allSettled(targets.map(c => setOpen(c, open)));
      const failed = targets.filter((_, i) => results[i].status === 'rejected').map(c => c.label);
      return { done: targets.length - failed.length, failed };
    },
    onSuccess: ({ done, failed }, open) => {
      refresh();
      if (failed.length) toast.error(`Não foi possível ${open ? 'abrir' : 'fechar'}: ${failed.join(', ')}.`);
      else toast.success(done ? `${done} canal(is) ${open ? 'aberto(s)' : 'fechado(s)'}.` : `Tudo já estava ${open ? 'aberto' : 'fechado'}.`);
    },
  });

  if (isLoading || !data) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const bySource = (s: string) => data.orders.filter(o => (o.source ?? 'internal') === s);
  const active = data.orders.filter(o => !['delivered', 'cancelled'].includes(o.delivery_status ?? ''));
  const revenue = data.orders.filter(o => o.delivery_status !== 'cancelled')
    .reduce((t, o) => t + Number(o.total) + Number(o.delivery_fee || 0) - Number(o.discount || 0), 0);
  const freeCouriers = data.couriers.filter(c => c.status === 'free').length;
  const anyEditable = channels.some(c => c.ready && canEdit(c.module));
  const openCount = channels.filter(c => c.open).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Store className="h-7 w-7 text-primary" /> Delivery</h1>
          <p className="text-muted-foreground">
            Todos os canais num lugar só. Abra ou feche cada um aqui, ou use os botões do topo para configurar cada canal.
          </p>
        </div>
        {anyEditable && (
          <div className="flex gap-2">
            <Button className="gap-2" disabled={all.isPending} onClick={() => all.mutate(true)}>
              {all.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />} Abrir tudo
            </Button>
            <Button variant="outline" className="gap-2" disabled={all.isPending} onClick={() => all.mutate(false)}>
              <DoorClosed className="h-4 w-4" /> Fechar tudo
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Canais abertos" value={`${openCount} de ${channels.length}`} />
        <Stat label="Pedidos hoje" value={String(data.orders.length)} />
        <Stat label="Em andamento" value={String(active.length)} />
        <Stat label="Vendido hoje" value={brl(revenue)} sub={`${freeCouriers} entregador(es) livre(s) de ${data.couriers.length}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map(c => {
          const editable = canEdit(c.module);
          const today = bySource(c.source).length;
          return (
            <Card key={c.key} className={cn(!c.open && 'opacity-90')}>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <SourceBadge source={c.source} /> {c.label}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={c.open ? 'default' : 'outline'} className={cn(c.open && 'bg-emerald-600 hover:bg-emerald-600')}>
                    {c.open ? 'Aberto' : 'Fechado'}
                  </Badge>
                  <Switch
                    checked={c.open}
                    disabled={!c.ready || !editable || toggle.isPending || all.isPending}
                    onCheckedChange={v => toggle.mutate({ c, open: v })}
                    aria-label={`${c.open ? 'Fechar' : 'Abrir'} ${c.label}`}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="truncate text-sm text-muted-foreground">{c.hint}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pedidos hoje</span>
                  <span className="font-semibold">{today}</span>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full gap-2">
                  <Link to={c.to}><Settings2 className="h-4 w-4" /> {c.ready ? 'Configurar' : 'Configurar para abrir'}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShoppingBag className="h-4 w-4" /> Lançados pela equipe hoje</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          {[['internal', 'Equipe / telefone'], ['pos', 'Balcão'], ['kiosk', 'Totem']].map(([k, l]) => (
            <span key={k} className="flex items-center gap-2"><SourceBadge source={k} /> {l}: <b>{bySource(k).length}</b></span>
          ))}
          <span className="flex items-center gap-2 text-muted-foreground"><Globe className="h-4 w-4" /><MessageCircle className="h-4 w-4" /> canais acima contam à parte</span>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
