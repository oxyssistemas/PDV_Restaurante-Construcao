// Promoções na central (mesma regra do banco: order_promo_discount / order_refresh_discount / coupon_check).
// Happy hour e leve X pague Y entram sozinhos no pedido, pelo horário em que cada item foi lançado.

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** in_time_window: dias (0=domingo) e faixa de horário no horário de Brasília. */
function inWindow(p, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at ? new Date(at) : new Date()).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const days = p.days ?? [];
  if (days.length && !days.includes(dow)) return false;
  const from = p.time_from?.slice(0, 5), to = p.time_to?.slice(0, 5);
  if (!from || !to || from === to) return true;
  const t = `${parts.hour}:${parts.minute}`;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

const localDate = (at) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at ? new Date(at) : new Date());

/** order_promo_channel */
function channelOf(order) {
  if (['ifood', '99food', 'keeta', 'rappi'].includes(order.source)) return null;
  if (order.order_type === 'delivery' || order.source === 'site' || order.source === 'whatsapp') return 'delivery';
  if (order.order_type === 'dine_in') return 'salon';
  return 'counter';
}

/** order_promo_discount: desconto automático e nomes das promoções aplicadas. */
function orderPromoDiscount(mirror, order) {
  const ch = channelOf(order);
  if (!ch) return { discount: 0, labels: null };
  const day = localDate(order.created_at);
  const menu = new Map(mirror.rows('menu_items').map(m => [m.id, m]));
  const items = mirror.rows('order_items').filter(i => i.order_id === order.id && i.status !== 'cancelled' && Number(i.unit_price) > 0
    && !menu.get(i.menu_item_id)?.is_rodizio_charge);
  const promos = mirror.rows('promotions')
    .filter(p => p.restaurant_id === order.restaurant_id && p.active && (p.kind === 'happy_hour' || p.kind === 'buy_x_pay_y')
      && (p.channels ?? []).includes(ch) && (!p.starts_on || p.starts_on <= day) && (!p.ends_on || p.ends_on >= day))
    .sort((a, b) => Number(a.kind !== 'happy_hour') - Number(b.kind !== 'happy_hour') || String(a.created_at).localeCompare(String(b.created_at)));
  const used = new Set();
  let discount = 0;
  const names = [];
  for (const p of promos) {
    const ok = items.filter(i => {
      if (used.has(i.id)) return false;
      const m = menu.get(i.menu_item_id);
      const any = !(p.item_ids ?? []).length && !(p.category_ids ?? []).length;
      return (any || (p.item_ids ?? []).includes(i.menu_item_id) || (!!m?.category_id && (p.category_ids ?? []).includes(m.category_id)))
        && inWindow(p, i.created_at);
    });
    let d = 0;
    if (p.kind === 'happy_hour') {
      d = ok.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0) * Number(p.percent) / 100;
    } else {
      const units = ok.flatMap(i => Array.from({ length: i.quantity }, () => Number(i.unit_price))).sort((a, b) => a - b);
      const free = Math.floor(units.length / p.buy_qty) * (p.buy_qty - p.pay_qty);
      d = units.slice(0, free).reduce((s, v) => s + v, 0);
    }
    d = round2(d);
    if (d > 0) {
      discount += d;
      names.push(p.name);
      ok.forEach(i => used.add(i.id));
    }
  }
  return { discount: round2(discount), labels: names.length ? names.join(' · ') : null };
}

/** order_refresh_discount: grava o desconto (automático + cupom) sem passar do valor dos itens. */
function refreshDiscount(mirror, orderId, who) {
  const order = mirror.rows('orders').find(o => o.id === orderId);
  if (!order) return;
  const { discount, labels } = orderPromoDiscount(mirror, order);
  const items = mirror.rows('order_items').filter(i => i.order_id === orderId && i.status !== 'cancelled')
    .reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  const total = round2(Math.min(discount + Number(order.coupon_discount || 0), items));
  if (Number(order.promo_discount || 0) === discount && (order.promo_labels ?? null) === labels && Number(order.discount || 0) === total) return;
  // a nuvem refaz a mesma conta quando os itens chegam: não precisa mandar
  mirror.sysUpdate('orders', order, { promo_discount: discount, promo_labels: labels, discount: total }, who, { sync: false });
}

/** coupon_check: confere o cupom da loja online e calcula o desconto. */
function couponCheck(mirror, restaurantId, code, subtotal, userId, phone) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return { ok: false, error: 'Digite o cupom.' };
  const p = mirror.rows('promotions').find(x => x.restaurant_id === restaurantId && x.kind === 'coupon' && x.code === c);
  if (!p || !p.active) return { ok: false, error: 'Cupom inválido.' };
  if (!(p.channels ?? []).includes('delivery')) return { ok: false, error: 'Este cupom não vale na loja online.' };
  const today = localDate();
  if ((p.starts_on && p.starts_on > today) || (p.ends_on && p.ends_on < today) || !inWindow(p)) return { ok: false, error: 'Este cupom não está valendo agora.' };
  if (Number(subtotal || 0) < Number(p.min_order || 0)) {
    return { ok: false, error: `Cupom válido para pedidos a partir de R$ ${Number(p.min_order).toFixed(2).replace('.', ',')}.` };
  }
  const uses = mirror.rows('coupon_redemptions').filter(r => r.promotion_id === p.id);
  if (p.max_uses && uses.length >= p.max_uses) return { ok: false, error: 'Este cupom já esgotou.' };
  if (p.per_customer && (userId || phone)) {
    const mine = uses.filter(r => (userId && r.customer_user_id === userId) || (phone && r.customer_phone === phone)).length;
    if (mine >= p.per_customer) return { ok: false, error: 'Você já usou este cupom.' };
  }
  const discount = p.discount_type === 'percent' ? round2(Number(subtotal) * Number(p.percent) / 100)
    : p.discount_type === 'amount' ? Math.min(Number(p.amount), Number(subtotal)) : 0;
  const label = p.discount_type === 'percent' ? `${Number(p.percent)}% de desconto`
    : p.discount_type === 'amount' ? `R$ ${Number(p.amount).toFixed(2).replace('.', ',')} de desconto` : 'Entrega grátis';
  return { ok: true, id: p.id, code: p.code, name: p.name, discount_type: p.discount_type, discount, free_delivery: p.discount_type === 'free_delivery', label };
}

/** Promoções automáticas de um canal (selos e prévia nas telas públicas). */
function activePromos(mirror, restaurantId, channel) {
  return mirror.rows('promotions')
    .filter(p => p.restaurant_id === restaurantId && p.active && (p.kind === 'happy_hour' || p.kind === 'buy_x_pay_y') && (p.channels ?? []).includes(channel))
    .map(p => ({
      id: p.id, name: p.name, kind: p.kind, active: p.active, starts_on: p.starts_on ?? null, ends_on: p.ends_on ?? null, days: p.days ?? [],
      time_from: p.time_from ?? null, time_to: p.time_to ?? null, channels: p.channels ?? [], item_ids: p.item_ids ?? [], category_ids: p.category_ids ?? [],
      percent: p.percent == null ? null : Number(p.percent), buy_qty: p.buy_qty ?? null, pay_qty: p.pay_qty ?? null, created_at: p.created_at,
    }));
}

module.exports = { refreshDiscount, couponCheck, activePromos, orderPromoDiscount };
