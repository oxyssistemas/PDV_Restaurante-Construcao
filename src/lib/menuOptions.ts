import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Opções do prato (Cardápio → item → Opções): Tamanho, Sabores (meio a meio) e Adicionais.
 * O cálculo aqui é o mesmo do banco (menu_item_quote), que confere o preço nos pedidos públicos.
 */
export type OptionKind = 'size' | 'flavor' | 'extra';
export type MenuOption = { id: string; group_id: string; name: string; price: number; linked_item_id: string | null; available: boolean; sort_order: number };
export type OptionGroup = {
  id: string; menu_item_id: string; name: string; kind: OptionKind; min_select: number; max_select: number;
  pricing: 'sum' | 'max' | 'avg'; sort_order: number; options: MenuOption[];
};

export const KIND_LABELS: Record<OptionKind, string> = {
  size: 'Tamanho',
  flavor: 'Sabores (meio a meio)',
  extra: 'Adicionais / montagem',
};

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Monta os grupos (com as opções) a partir das linhas das duas tabelas. */
export function buildGroups(groups: Omit<OptionGroup, 'options'>[], options: MenuOption[]): Map<string, OptionGroup[]> {
  const out = new Map<string, OptionGroup[]>();
  for (const g of [...groups].sort((a, b) => Number(a.kind !== 'size') - Number(b.kind !== 'size') || byOrder(a, b))) {
    const full: OptionGroup = { ...g, options: options.filter(o => o.group_id === g.id).sort(byOrder) };
    out.set(g.menu_item_id, [...(out.get(g.menu_item_id) ?? []), full]);
  }
  return out;
}

/** Todas as opções da loja, agrupadas por prato. */
export function useMenuOptions(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['menu-options', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [{ data: groups, error: e1 }, { data: options, error: e2 }] = await Promise.all([
        supabase.from('menu_option_groups').select('*').eq('restaurant_id', restaurantId!),
        supabase.from('menu_options').select('*').eq('restaurant_id', restaurantId!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return buildGroups((groups ?? []) as unknown as Omit<OptionGroup, 'options'>[], (options ?? []).map(o => ({ ...o, price: Number(o.price) })));
    },
  });
}

export type Quote = { price: number; label: string | null; error: string | null };

/** Preço final e descrição ("Tamanho G · 1/2 Calabresa, 1/2 Frango · Borda: Catupiry"). */
export function quoteItem(basePrice: number, groups: OptionGroup[], selected: string[]): Quote {
  const ids = new Set(selected);
  let base = Number(basePrice);
  let ratio = 1;
  let extras = 0;
  const parts: string[] = [];
  let error: string | null = null;
  for (const g of groups) {
    const chosen = g.options.filter(o => ids.has(o.id) && o.available);
    if (!error && chosen.length < g.min_select) error = `Escolha ${g.min_select === 1 ? '1 opção' : `${g.min_select} opções`} em ${g.name}.`;
    if (!error && chosen.length > g.max_select) error = `No máximo ${g.max_select} em ${g.name}.`;
    if (!chosen.length) continue;
    if (g.kind === 'size') {
      const o = chosen[0];
      ratio = Number(basePrice) > 0 ? o.price / Number(basePrice) : 1;
      base = o.price;
      parts.push(`${g.name} ${o.name}`);
    } else if (g.kind === 'flavor') {
      const prices = chosen.map(o => o.price);
      const v = g.pricing === 'avg' ? prices.reduce((a, b) => a + b, 0) / prices.length : Math.max(...prices);
      base = Math.round(v * ratio * 100) / 100;
      parts.push(chosen.map(o => `${chosen.length > 1 ? `1/${chosen.length} ` : ''}${o.name}`).join(', '));
    } else {
      extras += chosen.reduce((a, o) => a + o.price, 0);
      parts.push(`${g.name}: ${chosen.map(o => o.name).join(', ')}`);
    }
  }
  return { price: Math.round((base + extras) * 100) / 100, label: parts.length ? parts.join(' · ') : null, error };
}

/** Opções que já vêm marcadas: o primeiro tamanho quando o tamanho é obrigatório. */
export function defaultSelection(groups: OptionGroup[]): string[] {
  return groups.filter(g => g.kind === 'size' && g.min_select > 0).map(g => g.options.find(o => o.available)?.id).filter(Boolean) as string[];
}

type Schedule = { available_days?: number[] | null; available_from?: string | null; available_to?: string | null };

/** O prato está no horário agora? (mesma regra de menu_item_on_now, no horário de Brasília) */
export function itemOnNow(item: Schedule, now = new Date()): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const days = item.available_days ?? [];
  if (days.length && !days.includes(dow)) return false;
  const from = item.available_from?.slice(0, 5), to = item.available_to?.slice(0, 5);
  if (!from || !to || from === to) return true;
  const t = `${parts.hour}:${parts.minute}`;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** "Seg a Sex, 11:00–15:00" */
export function scheduleLabel(item: Schedule): string | null {
  const days = [...(item.available_days ?? [])].sort();
  const from = item.available_from?.slice(0, 5), to = item.available_to?.slice(0, 5);
  const d = days.length && days.length < 7 ? days.map(x => WEEKDAYS[x]).join(', ') : '';
  const h = from && to && from !== to ? `${from}–${to}` : '';
  return [d, h].filter(Boolean).join(', ') || null;
}

/** Preço de vitrine: com tamanhos, "a partir de" o menor tamanho. */
export function startingPrice(price: number, groups?: OptionGroup[] | null): { price: number; from: boolean } {
  const sizes = (groups ?? []).find(g => g.kind === 'size')?.options.filter(o => o.available).map(o => o.price) ?? [];
  return sizes.length ? { price: Math.min(...sizes), from: sizes.length > 1 } : { price: Number(price), from: false };
}
