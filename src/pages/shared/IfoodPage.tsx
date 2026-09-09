import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Check, X, Store, UploadCloud } from 'lucide-react';
import { ifoodCatalogSync, ifoodOrderAction, ifoodStoreStatus, ifoodSync } from '@/lib/ifood';

const decisionLabels: Record<string, string> = {
  pending: 'Aguardando decisão',
  accepted: 'Aceito',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

export default function IfoodPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const isAdmin = currentRole?.role === 'admin' || currentRole?.role === 'super_admin';
  const qc = useQueryClient();
  const [merchantId, setMerchantId] = useState('');

  const { data: integration, isLoading } = useQuery({
    queryKey: ['ifood-integration', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifood_integrations').select('*').eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (integration?.merchant_id) setMerchantId(integration.merchant_id);
  }, [integration?.merchant_id]);

  const { data: orders } = useQuery({
    queryKey: ['ifood-orders', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifood_orders').select('*')
        .eq('restaurant_id', restaurantId!)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Atualização automática entre portais
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase.channel('ifood-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ifood_orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ['ifood-orders', restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, qc]);

  const saveSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('ifood_integrations')
        .upsert({ restaurant_id: restaurantId!, merchant_id: merchantId || null, ...patch }, { onConflict: 'restaurant_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ifood-integration', restaurantId] });
      toast.success('Configuração salva.');
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível salvar.'),
  });

  const sync = useMutation({
    mutationFn: () => ifoodSync(restaurantId!),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['ifood-orders', restaurantId] });
      qc.invalidateQueries({ queryKey: ['ifood-integration', restaurantId] });
      toast.success(`Sincronizado: ${r?.imported ?? 0} novo(s) pedido(s).`);
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao buscar pedidos.'),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      ifoodOrderAction(restaurantId!, action, { ifoodOrderId: id }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ifood-orders', restaurantId] });
      toast.success(v.action === 'accept' ? 'Pedido aceito e enviado à cozinha.' : 'Pedido recusado no iFood.');
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível concluir.'),
  });

  const catalog = useMutation({
    mutationFn: () => ifoodCatalogSync(restaurantId!),
    onSuccess: (r: any) => toast.success(`Cardápio enviado: ${r?.priceOk ?? 0} preço(s) e ${r?.statusOk ?? 0} disponibilidade(s).`),
    onError: (e: any) => toast.error(e.message || 'Falha ao enviar o cardápio.'),
  });

  const store = useMutation({
    mutationFn: (open: boolean) => ifoodStoreStatus(restaurantId!, open),
    onSuccess: (_d, open) => {
      qc.invalidateQueries({ queryKey: ['ifood-integration', restaurantId] });
      toast.success(open ? 'Loja aberta no iFood.' : 'Loja fechada no iFood.');
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao mudar a loja no iFood.'),
  });

  // Busca periódica de novos pedidos quando a integração está ativa
  useEffect(() => {
    if (!restaurantId || !integration?.enabled || !integration?.merchant_id) return;
    const t = setInterval(() => sync.mutate(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, integration?.enabled, integration?.merchant_id]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const pending = (orders || []).filter(o => o.decision === 'pending');
  const others = (orders || []).filter(o => o.decision !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">iFood</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos do iFood chegam aqui; você aceita ou recusa e o restante do sistema é atualizado.
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-2">
          {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Buscar pedidos agora
        </Button>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Conexão com a loja</CardTitle>
            <CardDescription>
              Informe o código da sua loja no iFood (merchant ID). As chaves de acesso do iFood ficam guardadas com segurança no servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor="merchant">Código da loja (merchant ID)</Label>
              <Input id="merchant" value={merchantId} onChange={e => setMerchantId(e.target.value)} placeholder="ex.: 3f2b8b1a-..." />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Integração ativa</span>
                <Switch checked={!!integration?.enabled}
                  onCheckedChange={v => saveSettings.mutate({ enabled: v })} />
              </label>
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Sincronizar cardápio e preços</span>
                <Switch checked={!!integration?.sync_catalog}
                  onCheckedChange={v => saveSettings.mutate({ sync_catalog: v })} />
              </label>
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Sincronizar loja aberta/fechada</span>
                <Switch checked={!!integration?.sync_store_status}
                  onCheckedChange={v => saveSettings.mutate({ sync_store_status: v })} />
              </label>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Loja no iFood</span>
                <div className="flex gap-2">
                  <Button size="sm" variant={integration?.store_open ? 'default' : 'outline'}
                    onClick={() => store.mutate(true)} disabled={store.isPending} className="gap-1">
                    <Store className="h-3 w-3" /> Abrir
                  </Button>
                  <Button size="sm" variant={!integration?.store_open ? 'default' : 'outline'}
                    onClick={() => store.mutate(false)} disabled={store.isPending}>
                    Fechar
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveSettings.mutate({})} disabled={saveSettings.isPending}>
                Salvar
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => catalog.mutate()} disabled={catalog.isPending}>
                {catalog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Enviar cardápio ao iFood
              </Button>
            </div>

            {integration?.last_error && (
              <p className="text-sm text-destructive">Último erro: {integration.last_error}</p>
            )}
            {integration?.last_sync_at && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {new Date(integration.last_sync_at).toLocaleString('pt-BR')}
              </p>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Para o cardápio sincronizar, cada item precisa ter o código do produto do iFood preenchido no Cardápio.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pedidos aguardando aceite ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido aguardando.</p>}
          {pending.map(o => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  #{o.display_id || o.ifood_order_id.slice(0, 8)} — {o.customer_name || 'Cliente iFood'}
                </div>
                <div className="text-xs text-muted-foreground truncate">{o.customer_address || 'Sem endereço'}</div>
                <div className="text-sm">R$ {Number(o.total).toFixed(2)}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1" disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: o.ifood_order_id, action: 'accept' })}>
                  <Check className="h-3 w-3" /> Aceitar
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: o.ifood_order_id, action: 'reject' })}>
                  <X className="h-3 w-3" /> Recusar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Últimos pedidos do iFood</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {others.length === 0 && <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>}
          {others.map(o => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  #{o.display_id || o.ifood_order_id.slice(0, 8)} — {o.customer_name || 'Cliente iFood'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString('pt-BR')} · R$ {Number(o.total).toFixed(2)}
                </div>
              </div>
              <Badge variant={o.decision === 'accepted' ? 'default' : 'secondary'}>
                {decisionLabels[o.decision] || o.decision}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
