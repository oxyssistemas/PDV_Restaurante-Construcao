import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Copy, Loader2, Search, Store } from 'lucide-react';
import { toast } from 'sonner';
import SourceBadge from '@/components/delivery/SourceBadge';
import { brl } from '@/lib/finance';
import type { Json, Tables } from '@/integrations/supabase/types';

const CHANNELS = [
  { key: '99food', label: '99Food' },
  { key: 'keeta', label: 'Keeta' },
  { key: 'rappi', label: 'Rappi' },
] as const;
type Channel = typeof CHANNELS[number]['key'];
type Integration = Tables<'marketplace_integrations'>;

const webhookUrl = (channel: string, key: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marketplace-webhook/${channel}/${key}`;

/** 99Food, Keeta e Rappi: pedidos entram sozinhos pelo endereço (webhook) de cada loja. */
export default function MarketplacesPage() {
  const { currentRole } = useAuth();
  const rid = currentRole?.restaurant_id;
  const qc = useQueryClient();

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['marketplace-integrations', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketplace_integrations').select('*').eq('restaurant_id', rid!);
      if (error) throw error;
      return data;
    },
  });
  const { data: orders } = useQuery({
    queryKey: ['marketplace-orders', rid],
    enabled: !!rid,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketplace_orders').select('id, channel, display_id, external_id, customer_name, total, status, unmatched_items, created_at')
        .eq('restaurant_id', rid!).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ channel, patch }: { channel: Channel; patch: Partial<Integration> }) => {
      const current = integrations?.find(i => i.channel === channel);
      const { error } = current
        ? await supabase.from('marketplace_integrations').update(patch).eq('id', current.id)
        : await supabase.from('marketplace_integrations').insert({ restaurant_id: rid!, channel, ...patch });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace-integrations'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!rid) return null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Store className="h-7 w-7 text-primary" /> Apps de delivery</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos do 99Food, Keeta e Rappi entram sozinhos em Delivery → Pedidos e vão para a cozinha. Cada app pede um contrato de parceria:
          ao fechar, informe o endereço de recebimento abaixo ao suporte do app. Até lá, a equipe pode lançar esses pedidos à mão (escolhendo a origem no pedido).
        </p>
      </div>

      {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {CHANNELS.map(c => (
            <ChannelCard key={c.key} channel={c.key} label={c.label} integ={integrations?.find(i => i.channel === c.key)}
              onSave={patch => save.mutate({ channel: c.key, patch })} saving={save.isPending} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos pedidos recebidos dos apps</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>App</TableHead><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Total</TableHead><TableHead>Situação</TableHead><TableHead>Recebido</TableHead></TableRow></TableHeader>
            <TableBody>
              {!orders?.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido recebido ainda.</TableCell></TableRow>}
              {orders?.map(o => {
                const unmatched = Array.isArray(o.unmatched_items) ? o.unmatched_items.length : 0;
                return (
                  <TableRow key={o.id}>
                    <TableCell><SourceBadge source={o.channel} showLabel /></TableCell>
                    <TableCell>#{o.display_id ?? o.external_id.slice(0, 10)}</TableCell>
                    <TableCell>{o.customer_name ?? '—'}</TableCell>
                    <TableCell>{o.total != null ? brl(Number(o.total)) : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{o.status === 'cancelled' ? 'Cancelado no app' : 'Recebido'}</Badge>
                        {unmatched > 0 && <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500"><AlertTriangle className="h-3 w-3" /> {unmatched} item(ns) sem vínculo</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProductCodes restaurantId={rid} />
    </div>
  );
}

function ChannelCard({ channel, label, integ, onSave, saving }: { channel: Channel; label: string; integ?: Integration; onSave: (p: Partial<Integration>) => void; saving: boolean }) {
  const [storeRef, setStoreRef] = useState(integ?.store_ref ?? '');
  useEffect(() => setStoreRef(integ?.store_ref ?? ''), [integ?.store_ref]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><SourceBadge source={channel} /> {label}</CardTitle>
        <Switch checked={!!integ?.enabled} disabled={saving} onCheckedChange={v => onSave({ enabled: v })} aria-label={`Receber pedidos do ${label}`} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <Label>Id da loja no {label}</Label>
          <div className="flex gap-2">
            <Input value={storeRef} maxLength={80} placeholder="Informado pelo app" onChange={e => setStoreRef(e.target.value)} />
            <Button variant="outline" onClick={() => onSave({ store_ref: storeRef.trim() || null })} disabled={saving}>Salvar</Button>
          </div>
        </div>
        {integ ? (
          <div className="space-y-1.5">
            <Label>Endereço de recebimento (webhook)</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl(channel, integ.webhook_key)} className="text-xs" />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl(channel, integ.webhook_key)); toast.success('Endereço copiado.'); }}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : <p className="text-xs text-muted-foreground">Ligue a chave ou salve o id da loja para gerar o endereço.</p>}
        <p className="text-xs text-muted-foreground">
          {integ?.last_event_at ? `Último contato: ${new Date(integ.last_event_at).toLocaleString('pt-BR')}` : 'Nenhum contato do app ainda.'}
        </p>
        {integ?.last_error && <p className="flex gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {integ.last_error}</p>}
      </CardContent>
    </Card>
  );
}

/** Código de cada produto nos apps, para casar os itens dos pedidos (sem código, casa pelo nome igual). */
function ProductCodes({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const { data: items } = useQuery({
    queryKey: ['marketplace-codes', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_items').select('id, name, external_codes').eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data;
    },
  });
  const visible = useMemo(() => (items ?? []).filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const codesOf = (i: { id: string; external_codes: Json }) => ({ ...((i.external_codes ?? {}) as Record<string, string>), ...(draft[i.id] ?? {}) });

  const save = useMutation({
    mutationFn: async () => {
      for (const [id, codes] of Object.entries(draft)) {
        const item = items?.find(i => i.id === id);
        const merged = Object.fromEntries(Object.entries({ ...((item?.external_codes ?? {}) as Record<string, string>), ...codes }).filter(([, v]) => String(v).trim()));
        const { error } = await supabase.from('menu_items').update({ external_codes: merged }).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => { setDraft({}); qc.invalidateQueries({ queryKey: ['marketplace-codes'] }); toast.success('Códigos salvos.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Códigos dos produtos nos apps</CardTitle>
          <CardDescription>Opcional: sem código, o item do app casa com o produto de mesmo nome. Itens que não casarem aparecem nas observações do pedido.</CardDescription>
        </div>
        <div className="flex gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 w-48 pl-8" placeholder="Buscar produto" value={q} onChange={e => setQ(e.target.value)} /></div>
          <Button size="sm" className="h-9" disabled={!Object.keys(draft).length || save.isPending} onClick={() => save.mutate()}>Salvar códigos</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead>{CHANNELS.map(c => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {visible.map(i => {
              const codes = codesOf(i);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  {CHANNELS.map(c => (
                    <TableCell key={c.key}>
                      <Input className="h-8 w-32" value={codes[c.key] ?? ''} maxLength={60}
                        onChange={e => setDraft(d => ({ ...d, [i.id]: { ...(d[i.id] ?? {}), [c.key]: e.target.value } }))} />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
