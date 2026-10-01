import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl, storeMediaUrl } from '@/lib/deliveryStore';
import StoreImagePicker from './StoreImagePicker';

type MenuOption = { id: string; name: string; price: number };
type Promo = { id: string; title: string; subtitle: string | null; image: string | null; menu_item_id: string | null; active: boolean; sort_order: number };
type Draft = { id?: string; title: string; subtitle: string; image: string | null; menu_item_id: string | null; active: boolean };
const NONE = '__nenhum__';

/** Área promocional da loja online: banners com foto, texto e o prato que a promoção vende. */
export default function PromotionsManager({ restaurantId, menu }: { restaurantId: string; menu: MenuOption[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const key = ['delivery-promotions', restaurantId];

  const { data: promos, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_promotions')
        .select('id, title, subtitle, image, menu_item_id, active, sort_order')
        .eq('restaurant_id', restaurantId).order('sort_order').order('created_at');
      if (error) throw error;
      return (data || []) as Promo[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (d.title.trim().length < 2) throw new Error('Escreva o título da promoção.');
      const row = { title: d.title.trim(), subtitle: d.subtitle.trim() || null, image: d.image, menu_item_id: d.menu_item_id, active: d.active };
      const { error } = d.id
        ? await supabase.from('delivery_promotions').update(row).eq('id', d.id)
        : await supabase.from('delivery_promotions').insert({ ...row, restaurant_id: restaurantId, sort_order: (promos?.length ?? 0) });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setDraft(null); toast.success('Promoção salva'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Promo> }) => {
      const { error } = await supabase.from('delivery_promotions').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_promotions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success('Promoção removida'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Troca a posição com o vizinho (a ordem é a da loja).
  const move = async (index: number, dir: -1 | 1) => {
    const list = promos ?? [];
    const a = list[index], b = list[index + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from('delivery_promotions').update({ sort_order: index + dir }).eq('id', a.id),
      supabase.from('delivery_promotions').update({ sort_order: index }).eq('id', b.id),
    ]);
    refresh();
  };

  const item = (id: string | null) => menu.find(m => m.id === id);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" /> Promoções</CardTitle>
          <CardDescription>Banners da área promocional. O preço mostrado é o do prato escolhido, igual ao da sacola.</CardDescription>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setDraft({ title: '', subtitle: '', image: null, menu_item_id: null, active: true })}>
          <Plus className="h-4 w-4" /> Nova promoção
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : !promos?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma promoção. Crie uma para aparecer em destaque na loja.</p>
        ) : promos.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-2">
            <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
              {p.image ? <img src={storeMediaUrl(p.image)!} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="m-auto mt-4 h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item(p.menu_item_id) ? `${item(p.menu_item_id)!.name} · ${brl(Number(item(p.menu_item_id)!.price))}` : 'Sem prato (leva ao cardápio)'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Switch checked={p.active} aria-label="Ativa" onCheckedChange={v => patch.mutate({ id: p.id, values: { active: v } })} />
              <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === promos.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Editar"
                onClick={() => setDraft({ id: p.id, title: p.title, subtitle: p.subtitle ?? '', image: p.image, menu_item_id: p.menu_item_id, active: p.active })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Remover" className="text-destructive"
                onClick={() => { if (confirm(`Remover a promoção "${p.title}"?`)) remove.mutate(p.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={o => { if (!o) setDraft(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? 'Editar promoção' : 'Nova promoção'}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="promo-title">Título *</Label>
                <Input id="promo-title" value={draft.title} maxLength={80} placeholder="Pizza grande + refri 2L" onChange={e => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-sub">Texto de apoio</Label>
                <Textarea id="promo-sub" rows={2} maxLength={200} value={draft.subtitle} placeholder="Válido de segunda a quinta." onChange={e => setDraft({ ...draft, subtitle: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Prato da promoção</Label>
                <Select value={draft.menu_item_id ?? NONE} onValueChange={v => setDraft({ ...draft, menu_item_id: v === NONE ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum (botão leva ao cardápio)</SelectItem>
                    {menu.map(m => <SelectItem key={m.id} value={m.id}>{m.name} · {brl(Number(m.price))}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Com um prato, a loja mostra o preço dele e o botão já coloca na sacola. Para um combo com preço especial, cadastre o combo no cardápio.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Foto</Label>
                <StoreImagePicker restaurantId={restaurantId} value={draft.image} onChange={image => setDraft({ ...draft, image })} />
              </div>
              <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">
                Mostrar na loja <Switch checked={draft.active} onCheckedChange={v => setDraft({ ...draft, active: v })} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
