import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, ExternalLink, Loader2, Plus, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_LABELS, SLUG_RE, slugify, storeUrl, type StoreZone } from '@/lib/deliveryStore';

type Form = {
  slug: string; enabled: boolean; is_open: boolean; delivery_enabled: boolean; pickup_enabled: boolean;
  min_order: string; default_fee: string; zones: { name: string; fee: string }[];
  eta_minutes: string; pickup_eta_minutes: string; payment_methods: string[];
  whatsapp: string; address: string; hours_text: string; notice: string;
};

const blank = (slug: string): Form => ({
  slug, enabled: false, is_open: true, delivery_enabled: true, pickup_enabled: true,
  min_order: '0', default_fee: '0', zones: [], eta_minutes: '45', pickup_eta_minutes: '20',
  payment_methods: ['cash', 'credit_card', 'debit_card', 'pix'], whatsapp: '', address: '', hours_text: '', notice: '',
});
const num = (v: string) => Number(String(v).replace(',', '.')) || 0;

export default function StoreSettings() {
  const { currentRole } = useAuth();
  const { branding } = useBranding();
  const restaurantId = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  const { data: store, isLoading } = useQuery({
    queryKey: ['delivery-store', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_stores').select('*').eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (isLoading || form) return;
    if (!store) { setForm(blank(slugify(branding?.brand_name || ''))); return; }
    setForm({
      ...blank(store.slug), ...store,
      min_order: String(store.min_order), default_fee: String(store.default_fee),
      eta_minutes: String(store.eta_minutes), pickup_eta_minutes: String(store.pickup_eta_minutes),
      zones: ((store.zones as StoreZone[]) || []).map(z => ({ name: z.name, fee: String(z.fee) })),
      whatsapp: store.whatsapp ?? '', address: store.address ?? '', hours_text: store.hours_text ?? '', notice: store.notice ?? '',
    });
  }, [store, isLoading, form, branding]);

  const url = store?.slug ? storeUrl(store.slug) : null;
  useEffect(() => {
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { width: 512, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [url]);

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (!SLUG_RE.test(f.slug)) throw new Error('O endereço da loja deve ter de 3 a 40 letras minúsculas, números ou hífen.');
      if (!f.delivery_enabled && !f.pickup_enabled) throw new Error('Ative a entrega, a retirada ou as duas.');
      if (!f.payment_methods.length) throw new Error('Escolha ao menos uma forma de pagamento.');
      const zones = f.zones.filter(z => z.name.trim()).map(z => ({ name: z.name.trim(), fee: num(z.fee) }));
      const row = {
        restaurant_id: restaurantId!, slug: f.slug, enabled: f.enabled, is_open: f.is_open,
        delivery_enabled: f.delivery_enabled, pickup_enabled: f.pickup_enabled,
        min_order: num(f.min_order), default_fee: num(f.default_fee), zones,
        eta_minutes: Math.round(num(f.eta_minutes)) || 45, pickup_eta_minutes: Math.round(num(f.pickup_eta_minutes)) || 20,
        payment_methods: f.payment_methods, whatsapp: f.whatsapp.replace(/\D/g, '') || null,
        address: f.address.trim() || null, hours_text: f.hours_text.trim() || null, notice: f.notice.trim() || null,
      };
      const { error } = await supabase.from('delivery_stores').upsert(row, { onConflict: 'restaurant_id' });
      if (error) throw new Error(error.code === '23505' ? 'Esse endereço de loja já está em uso. Escolha outro.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-store', restaurantId] }); toast.success('Loja online salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Abrir/fechar na hora, sem precisar salvar o resto.
  const toggleOpen = useMutation({
    mutationFn: async (is_open: boolean) => {
      const { error } = await supabase.from('delivery_stores').update({ is_open }).eq('restaurant_id', restaurantId!);
      if (error) throw error;
      return is_open;
    },
    onSuccess: v => { set('is_open', v); qc.invalidateQueries({ queryKey: ['delivery-store', restaurantId] }); toast.success(v ? 'Loja aberta para pedidos' : 'Loja fechada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Loja online</h1>
          <p className="text-sm text-muted-foreground">Seu delivery próprio, sem comissão. Os pedidos caem direto na tela de pedidos e na cozinha.</p>
        </div>
        {store && (
          <label className="flex items-center gap-3 rounded-xl border px-4 py-2">
            <span className="text-sm font-medium">{form.is_open ? 'Aberta agora' : 'Fechada agora'}</span>
            <Switch checked={form.is_open} disabled={toggleOpen.isPending} onCheckedChange={v => toggleOpen.mutate(v)} />
          </label>
        )}
      </div>

      {url && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
            {qr && <img src={qr} alt="QR Code da loja" className="h-28 w-28 rounded-lg bg-white p-1" />}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={store?.enabled ? 'secondary' : 'outline'}>{store?.enabled ? 'Publicada' : 'Não publicada'}</Badge>
              </div>
              <p className="break-all font-mono text-sm">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'))}><Copy className="h-4 w-4" /> Copiar link</Button>
                <Button size="sm" variant="outline" className="gap-2" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Abrir</a></Button>
                {qr && <Button size="sm" variant="outline" className="gap-2" asChild><a href={qr} download={`qrcode-${store?.slug}.png`}><Download className="h-4 w-4" /> QR Code</a></Button>}
              </div>
              <p className="text-xs text-muted-foreground">Coloque o link na bio do Instagram, no Google e no WhatsApp. O QR Code vai bem em panfletos e embalagens.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> Dados da loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span><span className="block text-sm font-medium">Publicar loja</span><span className="text-xs text-muted-foreground">Desligada, o link mostra "loja indisponível".</span></span>
            <Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="st-slug">Endereço da loja</Label>
            <div className="flex items-center gap-1 text-sm">
              <span className="shrink-0 text-muted-foreground">…/pedir/</span>
              <Input id="st-slug" value={form.slug} maxLength={40} onChange={e => set('slug', slugify(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-wa">WhatsApp da loja</Label>
              <Input id="st-wa" value={form.whatsapp} inputMode="tel" placeholder="55 11 99999-0000" onChange={e => set('whatsapp', e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Botão "receber avisos pelo WhatsApp" na tela do pedido.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-hours">Horário de funcionamento</Label>
              <Input id="st-hours" value={form.hours_text} maxLength={120} placeholder="Ter a dom, das 18h às 23h" onChange={e => set('hours_text', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-address">Endereço (para retirada)</Label>
            <Input id="st-address" value={form.address} maxLength={200} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-notice">Aviso no topo da loja</Label>
            <Textarea id="st-notice" value={form.notice} maxLength={300} rows={2} placeholder="Ex.: Frete grátis acima de R$ 80 às terças!" onChange={e => set('notice', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrega e retirada</CardTitle>
          <CardDescription>Com bairros cadastrados, o cliente escolhe o bairro e a taxa sai certa. Sem bairros, vale a taxa padrão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Entrega <Switch checked={form.delivery_enabled} onCheckedChange={v => set('delivery_enabled', v)} /></label>
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Retirada no local <Switch checked={form.pickup_enabled} onCheckedChange={v => set('pickup_enabled', v)} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>Pedido mínimo (R$)</Label><Input inputMode="decimal" value={form.min_order} onChange={e => set('min_order', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Taxa padrão (R$)</Label><Input inputMode="decimal" value={form.default_fee} disabled={form.zones.length > 0} onChange={e => set('default_fee', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tempo de entrega (min)</Label><Input inputMode="numeric" value={form.eta_minutes} onChange={e => set('eta_minutes', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tempo p/ retirada (min)</Label><Input inputMode="numeric" value={form.pickup_eta_minutes} onChange={e => set('pickup_eta_minutes', e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Bairros atendidos</Label>
            {form.zones.map((z, i) => (
              <div key={i} className="flex gap-2">
                <Input value={z.name} placeholder="Bairro" maxLength={80}
                  onChange={e => set('zones', form.zones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input value={z.fee} inputMode="decimal" placeholder="Taxa" className="w-28"
                  onChange={e => set('zones', form.zones.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Remover bairro" onClick={() => set('zones', form.zones.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-2" onClick={() => set('zones', [...form.zones, { name: '', fee: '' }])}><Plus className="h-4 w-4" /> Adicionar bairro</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formas de pagamento</CardTitle>
          <CardDescription>O cliente paga na entrega ou na retirada. O entregador ou o caixa registra o pagamento na tela de pedidos.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(PAYMENT_LABELS).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              {l}
              <Switch checked={form.payment_methods.includes(k)}
                onCheckedChange={v => set('payment_methods', v ? [...form.payment_methods, k] : form.payment_methods.filter(x => x !== k))} />
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button size="lg" className="w-full sm:w-auto" disabled={save.isPending} onClick={() => save.mutate(form)}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar loja
        </Button>
      </div>
    </div>
  );
}
