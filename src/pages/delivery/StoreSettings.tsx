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
import { ArrowDown, ArrowUp, Copy, Download, ExternalLink, Flame, ImageIcon, Loader2, Plus, Sparkles, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl, PAYMENT_LABELS, SLUG_RE, slugify, storeUrl, type StoreZone } from '@/lib/deliveryStore';
import MenuImage from '@/components/MenuImage';
import StoreImagePicker from '@/components/delivery/StoreImagePicker';
import PromotionsManager from '@/components/delivery/PromotionsManager';

type Form = {
  slug: string; enabled: boolean; is_open: boolean; delivery_enabled: boolean; pickup_enabled: boolean;
  min_order: string; default_fee: string; zones: { name: string; fee: string }[];
  eta_minutes: string; pickup_eta_minutes: string; payment_methods: string[];
  whatsapp: string; address: string; hours_text: string; notice: string;
  hero_title: string; hero_highlight: string; hero_subtitle: string; hero_image: string | null; featured_item_ids: string[];
};
const MAX_FEATURED = 8;

const blank = (slug: string): Form => ({
  slug, enabled: false, is_open: true, delivery_enabled: true, pickup_enabled: true,
  min_order: '0', default_fee: '0', zones: [], eta_minutes: '45', pickup_eta_minutes: '20',
  payment_methods: ['cash', 'credit_card', 'debit_card', 'pix'], whatsapp: '', address: '', hours_text: '', notice: '',
  hero_title: '', hero_highlight: '', hero_subtitle: '', hero_image: null, featured_item_ids: [],
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
      hero_title: store.hero_title ?? '', hero_highlight: store.hero_highlight ?? '', hero_subtitle: store.hero_subtitle ?? '',
      hero_image: store.hero_image ?? null, featured_item_ids: store.featured_item_ids ?? [],
    });
  }, [store, isLoading, form, branding]);

  // Pratos do cardápio (destaques e promoções).
  const { data: menu } = useQuery({
    queryKey: ['delivery-store-menu', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_items').select('id, name, price, image_url, available')
        .eq('restaurant_id', restaurantId!).order('name');
      if (error) throw error;
      return (data || []).map(m => ({ ...m, price: Number(m.price) }));
    },
  });
  const toggleFeatured = (id: string) => setForm(f => {
    if (!f) return f;
    const has = f.featured_item_ids.includes(id);
    if (!has && f.featured_item_ids.length >= MAX_FEATURED) { toast.error(`Escolha até ${MAX_FEATURED} destaques.`); return f; }
    return { ...f, featured_item_ids: has ? f.featured_item_ids.filter(x => x !== id) : [...f.featured_item_ids, id] };
  });
  const moveFeatured = (i: number, dir: -1 | 1) => setForm(f => {
    if (!f) return f;
    const ids = [...f.featured_item_ids];
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    return { ...f, featured_item_ids: ids };
  });
  const firstPhoto = menu?.find(m => m.available && m.image_url)?.image_url ?? null;

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
        hero_title: f.hero_title.trim() || null, hero_highlight: f.hero_highlight.trim() || null,
        hero_subtitle: f.hero_subtitle.trim() || null, hero_image: f.hero_image, featured_item_ids: f.featured_item_ids,
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
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Banner principal</CardTitle>
          <CardDescription>O topo da loja: frase de impacto, parte em destaque (vermelho) e a foto.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="st-hero-title">Título</Label>
              <Input id="st-hero-title" value={form.hero_title} maxLength={60} placeholder="O melhor sabor" onChange={e => set('hero_title', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-hero-hl">Parte em destaque</Label>
              <Input id="st-hero-hl" value={form.hero_highlight} maxLength={60} placeholder="na sua casa!" onChange={e => set('hero_highlight', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-hero-sub">Descrição</Label>
              <Textarea id="st-hero-sub" rows={3} maxLength={220} value={form.hero_subtitle}
                placeholder="Hambúrgueres artesanais, pizzas e muito mais. Peça agora pelo nosso delivery." onChange={e => set('hero_subtitle', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Foto do banner</Label>
            {restaurantId && (
              <StoreImagePicker restaurantId={restaurantId} value={form.hero_image} onChange={v => set('hero_image', v)}
                fallbackUrl={null} fallbackLabel="Sem foto: a loja usa a foto de um prato" />
            )}
            {!form.hero_image && firstPhoto && <p className="text-[11px] text-muted-foreground">Sem foto escolhida, a loja mostra a foto de um prato do cardápio.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Flame className="h-4 w-4" /> Destaques do cardápio</CardTitle>
          <CardDescription>Escolha até {MAX_FEATURED} pratos para aparecer no topo da loja, na ordem abaixo. Sem destaques, a seção não aparece.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.featured_item_ids.length > 0 && (
            <ol className="space-y-2">
              {form.featured_item_ids.map((id, i) => {
                const m = menu?.find(x => x.id === id);
                return (
                  <li key={id} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-2">
                    <span className="w-5 text-center text-xs font-bold text-primary">{i + 1}</span>
                    <MenuImage path={m?.image_url ?? null} alt={m?.name ?? ''} className="h-10 w-10 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m?.name ?? 'Prato removido'}{m && !m.available && <span className="text-xs text-muted-foreground"> · indisponível</span>}</span>
                    <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => moveFeatured(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === form.featured_item_ids.length - 1} onClick={() => moveFeatured(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Tirar dos destaques" onClick={() => toggleFeatured(id)}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {(menu ?? []).filter(m => m.available && !form.featured_item_ids.includes(m.id)).map(m => (
              <button key={m.id} type="button" onClick={() => toggleFeatured(m.id)}
                className="flex items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:border-primary/50">
                <MenuImage path={m.image_url} alt={m.name} className="h-10 w-10 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{brl(m.price)}{!m.image_url && ' · sem foto'}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
            {!menu?.length && <p className="flex items-center gap-2 text-sm text-muted-foreground"><ImageIcon className="h-4 w-4" /> Cadastre pratos no cardápio primeiro.</p>}
          </div>
        </CardContent>
      </Card>

      {store && restaurantId && <PromotionsManager restaurantId={restaurantId} menu={(menu ?? []).filter(m => m.available)} />}

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
