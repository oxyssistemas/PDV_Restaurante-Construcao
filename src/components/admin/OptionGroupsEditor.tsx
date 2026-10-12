import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, ListPlus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_LABELS, WEEKDAYS, type OptionKind } from '@/lib/menuOptions';

export type EditOption = { id: string; name: string; price: string; linked_item_id: string | null; available: boolean };
export type EditGroup = {
  id: string; name: string; kind: OptionKind; min_select: number; max_select: number; pricing: 'sum' | 'max' | 'avg'; options: EditOption[];
};

const uid = () => crypto.randomUUID();

/** Grupos de opções de um prato, como estão no banco. */
export async function loadItemOptions(itemId: string): Promise<EditGroup[]> {
  const { data: groups } = await supabase.from('menu_option_groups').select('*').eq('menu_item_id', itemId).order('sort_order');
  if (!groups?.length) return [];
  const { data: options } = await supabase.from('menu_options').select('*').in('group_id', groups.map(g => g.id)).order('sort_order');
  return groups.map(g => ({
    id: g.id, name: g.name, kind: g.kind as OptionKind, min_select: g.min_select, max_select: g.max_select, pricing: g.pricing as EditGroup['pricing'],
    options: (options ?? []).filter(o => o.group_id === g.id)
      .map(o => ({ id: o.id, name: o.name, price: String(Number(o.price)), linked_item_id: o.linked_item_id, available: o.available })),
  }));
}

/** Grava os grupos (mantém os ids, para não quebrar pedidos em andamento) e apaga os removidos. */
export async function saveItemOptions(restaurantId: string, itemId: string, groups: EditGroup[]) {
  const clean = groups
    .map(g => ({ ...g, name: g.name.trim(), options: g.options.filter(o => o.name.trim()) }))
    .filter(g => g.name && g.options.length);
  const { data: existing } = await supabase.from('menu_option_groups').select('id').eq('menu_item_id', itemId);
  const keep = new Set(clean.map(g => g.id));
  const drop = (existing ?? []).map(g => g.id).filter(id => !keep.has(id));
  if (drop.length) {
    const { error } = await supabase.from('menu_option_groups').delete().in('id', drop);
    if (error) throw error;
  }
  if (!clean.length) return;
  const { error: gErr } = await supabase.from('menu_option_groups').upsert(clean.map((g, i) => ({
    id: g.id, restaurant_id: restaurantId, menu_item_id: itemId, name: g.name, kind: g.kind,
    min_select: Math.min(g.min_select, g.max_select), max_select: g.max_select, pricing: g.kind === 'extra' ? 'sum' : g.pricing, sort_order: i,
  })));
  if (gErr) throw gErr;
  const { data: oldOpts } = await supabase.from('menu_options').select('id').in('group_id', clean.map(g => g.id));
  const keepOpt = new Set(clean.flatMap(g => g.options.map(o => o.id)));
  const dropOpt = (oldOpts ?? []).map(o => o.id).filter(id => !keepOpt.has(id));
  if (dropOpt.length) await supabase.from('menu_options').delete().in('id', dropOpt);
  const { error: oErr } = await supabase.from('menu_options').upsert(clean.flatMap(g => g.options.map((o, i) => ({
    id: o.id, restaurant_id: restaurantId, group_id: g.id, name: o.name.trim(), price: Number(String(o.price).replace(',', '.')) || 0,
    linked_item_id: o.linked_item_id, available: o.available, sort_order: i,
  }))));
  if (oErr) throw oErr;
}

type Props = {
  groups: EditGroup[];
  onChange: (g: EditGroup[]) => void;
  allItems: { id: string; name: string; price: number | string; is_combo?: boolean }[];
  itemId?: string;
  basePrice: number;
};

const templates: Record<OptionKind, () => EditGroup> = {
  size: () => ({
    id: uid(), name: 'Tamanho', kind: 'size', min_select: 1, max_select: 1, pricing: 'sum',
    options: [{ id: uid(), name: 'P', price: '', linked_item_id: null, available: true }, { id: uid(), name: 'M', price: '', linked_item_id: null, available: true }, { id: uid(), name: 'G', price: '', linked_item_id: null, available: true }],
  }),
  flavor: () => ({ id: uid(), name: 'Sabores', kind: 'flavor', min_select: 1, max_select: 2, pricing: 'max', options: [] }),
  extra: () => ({ id: uid(), name: 'Adicionais', kind: 'extra', min_select: 0, max_select: 3, pricing: 'sum', options: [{ id: uid(), name: '', price: '', linked_item_id: null, available: true }] }),
};

/** Editor de Tamanho, Sabores (meio a meio) e Adicionais/montagem do prato. */
export default function OptionGroupsEditor({ groups, onChange, allItems, itemId, basePrice }: Props) {
  const set = (id: string, patch: Partial<EditGroup>) => onChange(groups.map(g => g.id === id ? { ...g, ...patch } : g));
  const setOpt = (g: EditGroup, oid: string, patch: Partial<EditOption>) =>
    set(g.id, { options: g.options.map(o => o.id === oid ? { ...o, ...patch } : o) });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <ListPlus className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Opções do prato</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Tamanhos (P/M/G), sabores para meio a meio (pizza de 2, 3 ou 4 sabores) e adicionais com mínimo e máximo
        (borda, ponto da carne, monte seu prato). O cliente escolhe no QR, no totem e na loja online; o garçom e o caixa também.
      </p>

      {groups.map(g => (
        <div key={g.id} className="space-y-3 rounded-lg bg-muted/40 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_190px_auto]">
            <Input aria-label="Nome do grupo" value={g.name} maxLength={60} onChange={e => set(g.id, { name: e.target.value })} placeholder="Ex.: Borda" />
            <Select value={g.kind} onValueChange={(k: OptionKind) => set(g.id, k === 'size'
              ? { kind: k, max_select: 1, min_select: Math.min(g.min_select, 1) }
              : { kind: k, pricing: k === 'flavor' ? 'max' : 'sum' })}>
              <SelectTrigger aria-label="Tipo do grupo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as OptionKind[]).map(k => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remover ${g.name}`}
              onClick={() => onChange(groups.filter(x => x.id !== g.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {g.kind === 'size' && (
              <label className="flex items-center gap-2">
                <Switch checked={g.min_select > 0} onCheckedChange={v => set(g.id, { min_select: v ? 1 : 0 })} /> Obrigatório escolher
              </label>
            )}
            {g.kind === 'flavor' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Até</span>
                  <Select value={String(g.max_select)} onValueChange={v => set(g.id, { max_select: Number(v) })}>
                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 sabor</SelectItem>
                      <SelectItem value="2">2 (meio a meio)</SelectItem>
                      <SelectItem value="3">3 sabores</SelectItem>
                      <SelectItem value="4">4 sabores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Preço</span>
                  <Select value={g.pricing} onValueChange={(v: 'max' | 'avg') => set(g.id, { pricing: v })}>
                    <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="max">do sabor mais caro</SelectItem>
                      <SelectItem value="avg">média dos sabores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {g.kind === 'extra' && (
              <>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Mínimo</span>
                  <Input type="number" min={0} max={20} className="h-8 w-16" value={g.min_select}
                    onChange={e => set(g.id, { min_select: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Máximo</span>
                  <Input type="number" min={1} max={20} className="h-8 w-16" value={g.max_select}
                    onChange={e => set(g.id, { max_select: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
                </label>
              </>
            )}
          </div>

          <div className="space-y-2">
            {g.options.map(o => (
              <div key={o.id} className="grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
                <Input aria-label="Nome da opção" value={o.name} maxLength={80} placeholder={g.kind === 'size' ? 'Ex.: Grande' : 'Nome'}
                  onChange={e => setOpt(g, o.id, { name: e.target.value })} />
                <Input aria-label="Preço da opção" inputMode="decimal" value={o.price}
                  placeholder={g.kind === 'extra' ? '+ R$' : 'R$'} onChange={e => setOpt(g, o.id, { price: e.target.value })} />
                <Switch aria-label="Disponível" checked={o.available} onCheckedChange={v => setOpt(g, o.id, { available: v })} />
                <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remover ${o.name || 'opção'}`}
                  onClick={() => set(g.id, { options: g.options.filter(x => x.id !== o.id) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {g.kind === 'size' && (
              <p className="text-[11px] text-muted-foreground">Preço de cada tamanho. O preço principal do prato vale como referência ({`R$ ${basePrice.toFixed(2)}`}) para ajustar os sabores na mesma proporção.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1"
                onClick={() => set(g.id, { options: [...g.options, { id: uid(), name: '', price: '', linked_item_id: null, available: true }] })}>
                <Plus className="h-3.5 w-3.5" /> Opção
              </Button>
              {g.kind === 'flavor' && (
                <Select value="" onValueChange={v => {
                  const it = allItems.find(i => i.id === v);
                  if (it && !g.options.some(o => o.linked_item_id === it.id)) {
                    set(g.id, { options: [...g.options, { id: uid(), name: it.name, price: String(Number(it.price)), linked_item_id: it.id, available: true }] });
                  }
                }}>
                  <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Puxar sabor do cardápio" /></SelectTrigger>
                  <SelectContent>
                    {allItems.filter(i => i.id !== itemId && !i.is_combo).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.name} — R$ {Number(i.price).toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(templates) as OptionKind[]).map(k => (
          <Button key={k} type="button" size="sm" variant="outline" className="gap-1" onClick={() => onChange([...groups, templates[k]()])}>
            <Plus className="h-3.5 w-3.5" /> {KIND_LABELS[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}

type ScheduleProps = {
  days: number[]; from: string; to: string;
  onChange: (v: { days: number[]; from: string; to: string }) => void;
};

/** Dias e horário em que o prato aparece (ex.: almoço executivo só de segunda a sexta, 11h às 15h). */
export function ScheduleEditor({ days, from, to, onChange }: ScheduleProps) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Horário de venda</Label>
      </div>
      <p className="text-xs text-muted-foreground">Deixe tudo em branco para vender sempre. Fora do horário o prato some do QR, do totem e da loja online.</p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d, i) => {
          const on = days.includes(i);
          return (
            <button key={d} type="button" aria-pressed={on}
              onClick={() => onChange({ days: on ? days.filter(x => x !== i) : [...days, i].sort(), from, to })}
              className={cn('h-9 min-w-11 rounded-full border px-3 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Das</span>
        <Input type="time" aria-label="Começa às" className="h-9 w-[120px]" value={from} onChange={e => onChange({ days, from: e.target.value, to })} />
        <span className="text-muted-foreground">às</span>
        <Input type="time" aria-label="Termina às" className="h-9 w-[120px]" value={to} onChange={e => onChange({ days, from, to: e.target.value })} />
        {(days.length > 0 || from || to) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ days: [], from: '', to: '' })}>Limpar</Button>
        )}
      </div>
    </div>
  );
}
