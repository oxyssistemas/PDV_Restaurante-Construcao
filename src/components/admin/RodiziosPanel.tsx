import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import type { Tables } from '@/integrations/supabase/types';

export type Rodizio = Tables<'rodizios'>;

export function useRodizios(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['rodizios', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('rodizios').select('*').eq('restaurant_id', restaurantId!).order('sort_order').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

type Form = { id?: string; name: string; description: string; price_adult: string; price_child: string; active: boolean };
const empty: Form = { name: '', description: '', price_adult: '', price_child: '', active: true };

/**
 * Rodízios da loja (Cardápio → Rodízios): nome e preço por pessoa. Os pratos entram no rodízio
 * pela marcação "Faz parte do rodízio" no cadastro de cada item.
 */
export default function RodiziosPanel({ restaurantId, items }: { restaurantId: string; items: { rodizio_ids?: string[] | null }[] }) {
  const qc = useQueryClient();
  const { data: rodizios, isLoading } = useRodizios(restaurantId);
  const [form, setForm] = useState<Form | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rodizio | null>(null);

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const payload = {
        restaurant_id: restaurantId,
        name: f.name.trim(),
        description: f.description.trim() || null,
        price_adult: Number(f.price_adult.replace(',', '.')) || 0,
        price_child: f.price_child.trim() ? Number(f.price_child.replace(',', '.')) || 0 : null,
        active: f.active,
      };
      if (payload.name.length < 2) throw new Error('Informe o nome do rodízio.');
      const { error } = f.id
        ? await supabase.from('rodizios').update(payload).eq('id', f.id)
        : await supabase.from('rodizios').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rodizios'] });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      setForm(null);
      toast.success('Rodízio salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: Rodizio) => {
      const { error } = await supabase.from('rodizios').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rodizios'] }); setConfirmDelete(null); toast.success('Rodízio removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const countItems = (id: string) => items.filter(i => (i.rodizio_ids ?? []).includes(id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cadastre o rodízio com o preço por pessoa. Depois, no cadastro de cada prato, marque "Faz parte do rodízio".
          Na mesa em rodízio, o QR e o tablet mostram só esses pratos, sem cobrar; fora do rodízio eles têm o preço normal.
        </p>
        <Button className="gap-2" onClick={() => setForm({ ...empty })}><Plus className="h-4 w-4" /> Novo rodízio</Button>
      </div>

      {!rodizios?.length ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <UtensilsCrossed className="h-8 w-8" />
          Nenhum rodízio cadastrado ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rodizios.map(r => (
            <Card key={r.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    {!r.active && <Badge variant="outline">Pausado</Badge>}
                  </div>
                  <p className="text-sm">
                    <b>{brl(Number(r.price_adult))}</b> por adulto
                    {r.price_child != null && <> · <b>{brl(Number(r.price_child))}</b> por criança</>}
                  </p>
                  <p className="text-xs text-muted-foreground">{countItems(r.id)} prato(s) no rodízio{r.description ? ` · ${r.description}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${r.name}`} onClick={() => setForm({
                    id: r.id, name: r.name, description: r.description ?? '', price_adult: String(r.price_adult),
                    price_child: r.price_child == null ? '' : String(r.price_child), active: r.active,
                  })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Remover ${r.name}`} onClick={() => setConfirmDelete(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? 'Editar rodízio' : 'Novo rodízio'}</DialogTitle></DialogHeader>
          {form && (
            <form id="rodizio-form" className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(form); }}>
              <div className="space-y-2">
                <Label htmlFor="rod-name">Nome</Label>
                <Input id="rod-name" placeholder="Ex.: Pizza, Japonês, Churrasco" value={form.name} maxLength={60}
                  onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rod-adult">Preço por adulto (R$)</Label>
                  <Input id="rod-adult" inputMode="decimal" value={form.price_adult} onChange={e => setForm({ ...form, price_adult: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rod-child">Preço por criança (opcional)</Label>
                  <Input id="rod-child" inputMode="decimal" placeholder="Sem preço infantil" value={form.price_child}
                    onChange={e => setForm({ ...form, price_child: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rod-desc">Descrição (opcional)</Label>
                <Textarea id="rod-desc" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="rod-active">Disponível para o garçom escolher</Label>
                <Switch id="rod-active" checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button type="submit" form="rodizio-form" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover o rodízio {confirmDelete?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mesas que estiverem neste rodízio saem dele. Os pratos continuam no cardápio com o preço normal.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete)}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
