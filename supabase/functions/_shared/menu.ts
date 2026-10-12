// Cardápio público (QR, totem e loja online): horário de venda do prato e opções (Tamanho, Sabores, Adicionais).
// O preço final é conferido no banco (menu_item_quote) quando o pedido é gravado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENU_ITEM_FIELDS = 'id, name, description, price, image_url, category_id, available_days, available_from, available_to, sold_by_weight';

type Schedule = { available_days?: number[] | null; available_from?: string | null; available_to?: string | null; sold_by_weight?: boolean | null };

/** menu_item_on_now: dias (0=domingo) e faixa de horário no horário de Brasília. */
export function onNow(item: Schedule, now = new Date()): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  const days = item.available_days ?? [];
  if (days.length && !days.includes(dow)) return false;
  const from = item.available_from?.slice(0, 5), to = item.available_to?.slice(0, 5);
  if (!from || !to || from === to) return true;
  const t = `${p.hour}:${p.minute}`;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** Junta em cada prato os grupos de opções disponíveis (option_groups) e tira os campos de horário. */
// deno-lint-ignore no-explicit-any
export async function withOptions<T extends { id: string }>(sb: any, restaurantId: string, items: (T & Schedule)[]) {
  const { data: groups } = await sb.from('menu_option_groups')
    .select('id, menu_item_id, name, kind, min_select, max_select, pricing, sort_order, created_at')
    .eq('restaurant_id', restaurantId);
  const { data: options } = groups?.length
    ? await sb.from('menu_options').select('id, group_id, name, price, linked_item_id, sort_order')
      .eq('restaurant_id', restaurantId).eq('available', true)
    : { data: [] };
  // deno-lint-ignore no-explicit-any
  const byItem = new Map<string, any[]>();
  // deno-lint-ignore no-explicit-any
  for (const g of [...(groups ?? [])].sort((a: any, b: any) => Number(a.kind !== 'size') - Number(b.kind !== 'size') || a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))) {
    const opts = (options ?? [])
      // deno-lint-ignore no-explicit-any
      .filter((o: any) => o.group_id === g.id)
      // deno-lint-ignore no-explicit-any
      .sort((a: any, b: any) => a.sort_order - b.sort_order || String(a.name).localeCompare(String(b.name)))
      // deno-lint-ignore no-explicit-any
      .map((o: any) => ({ ...o, price: Number(o.price), available: true }));
    if (!opts.length) continue;
    const { created_at: _c, ...rest } = g;
    byItem.set(g.menu_item_id, [...(byItem.get(g.menu_item_id) ?? []), { ...rest, options: opts }]);
  }
  // prato por quilo precisa ser pesado na loja: fica fora do QR, totem e loja online
  return items.filter(i => onNow(i) && !i.sold_by_weight).map(({ available_days: _d, available_from: _f, available_to: _t, sold_by_weight: _w, ...i }) => ({
    ...i, option_groups: byItem.get(i.id) ?? [],
  }));
}

/** Opções enviadas pelo cliente: só ids válidos, no máximo 30. */
export function cleanOptions(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(x => UUID.test(x)).slice(0, 30) : [];
}

/** Promoções automáticas do canal (happy hour e leve X pague Y), para selos e prévia do desconto nas telas públicas. */
// deno-lint-ignore no-explicit-any
export async function activePromos(sb: any, restaurantId: string, channel: 'salon' | 'counter' | 'delivery') {
  const { data } = await sb.from('promotions')
    .select('id, name, kind, active, starts_on, ends_on, days, time_from, time_to, channels, item_ids, category_ids, percent, buy_qty, pay_qty, created_at')
    .eq('restaurant_id', restaurantId).eq('active', true).in('kind', ['happy_hour', 'buy_x_pay_y']).contains('channels', [channel]);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({ ...p, percent: p.percent == null ? null : Number(p.percent) }));
}
