import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Promoções (Admin → Promoções). O desconto que vale é o calculado no banco (order_promo_discount) e gravado em
 * orders.discount; aqui fica o mesmo cálculo para mostrar selos e prévias nas telas.
 */
export type PromoKind = 'happy_hour' | 'buy_x_pay_y' | 'coupon';
export type PromoChannel = 'salon' | 'counter' | 'delivery';
export type Promotion = {
  id: string; name: string; kind: PromoKind; active: boolean;
  starts_on: string | null; ends_on: string | null; days: number[]; time_from: string | null; time_to: string | null;
  channels: PromoChannel[]; item_ids: string[]; category_ids: string[];
  percent: number | null; buy_qty: number | null; pay_qty: number | null;
  code?: string | null; discount_type?: string | null; amount?: number | null; min_order?: number;
  max_uses?: number | null; per_customer?: number | null; created_at?: string;
};

export const KIND_LABELS: Record<PromoKind, string> = {
  happy_hour: 'Happy hour (% de desconto no horário)',
  buy_x_pay_y: 'Leve X, pague Y',
  coupon: 'Cupom da loja online',
};
export const CHANNEL_LABELS: Record<PromoChannel, string> = { salon: 'Salão', counter: 'Balcão e totem', delivery: 'Delivery e loja online' };

export function usePromotions(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['promotions', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('promotions').select('*').eq('restaurant_id', restaurantId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Promotion[];
    },
  });
}

/** Mesma regra de in_time_window no banco (horário de Brasília). */
export function inWindow(p: { days?: number[] | null; time_from?: string | null; time_to?: string | null }, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  if ((p.days ?? []).length && !(p.days ?? []).includes(dow)) return false;
  const from = p.time_from?.slice(0, 5), to = p.time_to?.slice(0, 5);
  if (!from || !to || from === to) return true;
  const t = `${parts.hour}:${parts.minute}`;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

const today = (at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at);

/** Promoção valendo agora (datas, dias e horário). */
export function promoOnNow(p: Promotion, at = new Date()) {
  const d = today(at);
  return p.active && (!p.starts_on || p.starts_on <= d) && (!p.ends_on || p.ends_on >= d) && inWindow(p, at);
}

const eligible = (p: Promotion, item: { id: string; category_id?: string | null }) =>
  (!p.item_ids.length && !p.category_ids.length) || p.item_ids.includes(item.id) || (!!item.category_id && p.category_ids.includes(item.category_id));

/** Selo do prato no cardápio ("-20% no happy hour", "Leve 3 pague 2"). */
export function promoBadge(item: { id: string; category_id?: string | null }, promos: Promotion[], channel: PromoChannel, at = new Date()): string | null {
  for (const p of promos) {
    if (p.kind === 'coupon' || !p.channels.includes(channel) || !promoOnNow(p, at) || !eligible(p, item)) continue;
    if (p.kind === 'happy_hour') return `-${Number(p.percent)}% ${p.name}`;
    return `Leve ${p.buy_qty}, pague ${p.pay_qty}`;
  }
  return null;
}

type Line = { id: string; menu_item_id: string; category_id?: string | null; unit_price: number; quantity: number; created_at?: string; rodizio_charge?: boolean };

/** Prévia do desconto automático (mesma ordem do banco: happy hour, depois leve X pague Y nas sobras). */
export function promoDiscount(lines: Line[], promos: Promotion[], channel: PromoChannel, at = new Date()): { discount: number; labels: string[] } {
  const used = new Set<string>();
  let discount = 0;
  const labels: string[] = [];
  const list = promos.filter(p => p.kind !== 'coupon' && p.active && p.channels.includes(channel))
    .sort((a, b) => Number(a.kind !== 'happy_hour') - Number(b.kind !== 'happy_hour') || String(a.created_at).localeCompare(String(b.created_at)));
  for (const p of list) {
    const d0 = today(at);
    if ((p.starts_on && p.starts_on > d0) || (p.ends_on && p.ends_on < d0)) continue;
    const ok = lines.filter(l => l.unit_price > 0 && !l.rodizio_charge && !used.has(l.id)
      && eligible(p, { id: l.menu_item_id, category_id: l.category_id }) && inWindow(p, l.created_at ? new Date(l.created_at) : at));
    let d = 0;
    if (p.kind === 'happy_hour') {
      d = ok.reduce((s, l) => s + l.unit_price * l.quantity, 0) * Number(p.percent) / 100;
    } else if (p.buy_qty && p.pay_qty) {
      const units = ok.flatMap(l => Array.from({ length: l.quantity }, () => l.unit_price)).sort((a, b) => a - b);
      const free = Math.floor(units.length / p.buy_qty) * (p.buy_qty - p.pay_qty);
      d = units.slice(0, free).reduce((s, v) => s + v, 0);
    }
    d = Math.round(d * 100) / 100;
    if (d > 0) {
      discount += d;
      labels.push(p.name);
      ok.forEach(l => used.add(l.id));
    }
  }
  return { discount: Math.round(discount * 100) / 100, labels };
}

/** Canal do pedido para as promoções (order_promo_channel no banco). */
export function orderChannel(source?: string | null, orderType?: string | null): PromoChannel | null {
  if (['ifood', '99food', 'keeta', 'rappi'].includes(source ?? '')) return null;
  if (orderType === 'delivery' || source === 'site' || source === 'whatsapp') return 'delivery';
  if (orderType === 'dine_in') return 'salon';
  return 'counter';
}

/** Rótulo do desconto gravado no pedido. */
export const discountLabel = (o: { promo_labels?: string | null; coupon_code?: string | null }) =>
  [o.promo_labels, o.coupon_code ? `Cupom ${o.coupon_code}` : null].filter(Boolean).join(' · ') || 'Desconto';
