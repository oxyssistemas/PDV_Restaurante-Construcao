import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, History, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { brl, downloadCsv } from '@/lib/finance';
import { authorLabel, orderTypeLabels } from '@/lib/orders';

export default function OrdersHistory() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const [search, setSearch] = useState('');

  const { data: sessions } = useQuery({
    queryKey: ['kitchen-sessions', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('kitchen_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('opened_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['archived-orders', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant_tables(number), order_items(id, quantity, unit_price, menu_items(name))')
        .eq('restaurant_id', restaurantId!)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders || [];
    return (orders || []).filter(o =>
      `${o.customer_name || ''} ${(o as any).restaurant_tables?.number || ''} ${o.created_by_name || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [orders, search]);

  const exportCsv = () => {
    downloadCsv('historico-pedidos.csv', [
      ['Data', 'Tipo', 'Mesa/Cliente', 'Lançado por', 'Itens', 'Total'],
      ...filtered.map(o => [
        format(new Date(o.archived_at as string), 'dd/MM/yyyy HH:mm'),
        orderTypeLabels[o.order_type] || o.order_type,
        o.customer_name || `Mesa ${(o as any).restaurant_tables?.number ?? '-'}`,
        authorLabel(o as any),
        ((o as any).order_items || []).map((i: any) => `${i.quantity}x ${i.menu_items?.name}`).join(' | '),
        (Number(o.total) + Number(o.delivery_fee || 0)).toFixed(2).replace('.', ','),
      ]),
    ]);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <History className="h-6 w-6 text-primary" /> Histórico de pedidos
        </h1>
        <Input
          className="ml-auto w-full max-w-xs"
          placeholder="Buscar cliente, mesa, usuário..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Expedientes da cozinha</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!sessions?.length && <p className="text-sm text-muted-foreground">Nenhum expediente registrado.</p>}
          {(sessions || []).map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
              <Badge variant={s.closed_at ? 'secondary' : 'default'}>{s.closed_at ? 'Fechado' : 'Aberto'}</Badge>
              <span>Abriu {format(new Date(s.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
              {s.closed_at && <span>· Fechou {format(new Date(s.closed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>}
              <span className="ml-auto text-muted-foreground">{s.orders_archived} pedidos arquivados</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pedidos arquivados ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum pedido arquivado.</p>}
          {filtered.map(o => (
            <div key={o.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {o.customer_name || `Mesa ${(o as any).restaurant_tables?.number ?? '-'}`}
                </span>
                <Badge variant="outline">{orderTypeLabels[o.order_type] || o.order_type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(o.archived_at as string), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                <span className="ml-auto font-bold">{brl(Number(o.total) + Number(o.delivery_fee || 0))}</span>
              </div>
              <ul className="mt-1 text-xs text-muted-foreground">
                {((o as any).order_items || []).map((i: any) => (
                  <li key={i.id}>{i.quantity}x {i.menu_items?.name}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">Lançado por {authorLabel(o as any)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
