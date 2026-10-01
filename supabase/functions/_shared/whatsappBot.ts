import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getAccount, getCredential, graph } from './marketing.ts';

// Robô de atendimento do WhatsApp de cada restaurante.
// O número é o WhatsApp Business conectado em Marketing → Conexões; o robô responde com um menu,
// manda o link da loja online, informa o status do pedido e passa para um atendente quando pedido.

export const STORE_BASE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.oxysrestaurante.app').replace(/\/$/, '');
const WINDOW_MS = 24 * 60 * 60_000; // a Meta só deixa mandar texto livre até 24 h depois da última mensagem do cliente
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const last8 = (phone: string | null | undefined) => String(phone ?? '').replace(/\D/g, '').slice(-8);
const code = (orderId: string) => orderId.slice(0, 8).toUpperCase();

type Conversation = {
  id: string; restaurant_id: string; phone: string; contact_name: string | null;
  bot_paused_until: string | null; needs_human: boolean; last_bot_at: string | null; last_inbound_at: string | null; last_order_id: string | null;
};

export async function sendText(admin: SupabaseClient, restaurantId: string, conv: Pick<Conversation, 'id' | 'phone'>, text: string, sentBy: string | null = null) {
  const token = await getCredential(admin, restaurantId, 'meta');
  const wa = await getAccount(admin, restaurantId, 'whatsapp');
  const r = await graph(`/${wa.external_id}/messages`, token, {
    method: 'POST', params: { messaging_product: 'whatsapp', to: conv.phone, type: 'text', text: { body: text, preview_url: true } },
  });
  const now = new Date().toISOString();
  await admin.from('whatsapp_messages').insert({
    restaurant_id: restaurantId, conversation_id: conv.id, direction: 'out', body: text, external_id: r.messages?.[0]?.id ?? null, sent_by: sentBy,
  });
  await admin.from('whatsapp_conversations').update({ last_message: text, last_message_at: now, ...(sentBy ? { unread_count: 0 } : { last_bot_at: now }) }).eq('id', conv.id);
}

async function context(admin: SupabaseClient, restaurantId: string) {
  const [{ data: settings }, { data: store }, { data: restaurant }, { data: branding }] = await Promise.all([
    admin.from('whatsapp_bot_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    admin.from('delivery_stores').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    admin.from('restaurants').select('name, address').eq('id', restaurantId).maybeSingle(),
    admin.from('branding_settings').select('brand_name').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);
  const name = branding?.brand_name?.trim() || restaurant?.name || 'nosso restaurante';
  return { settings, store, name, address: store?.address || restaurant?.address || null };
}

export const storeLink = (slug: string, phone?: string) =>
  `${STORE_BASE}/pedir/${slug}?canal=whatsapp${phone ? `&tel=${phone}` : ''}`;
export const trackLink = (slug: string, orderId: string, token: string) => `${STORE_BASE}/pedir/${slug}/pedido/${orderId}?t=${token}`;

type OrderRow = {
  id: string; restaurant_id: string; order_type: string; delivery_status: string; status: string; total: number; delivery_fee: number;
  customer_name: string | null; customer_phone: string | null; public_token: string | null; created_at: string;
};

export function statusMessage(o: OrderRow) {
  const pickup = o.order_type === 'takeaway';
  switch (o.delivery_status) {
    case 'pending': return `📝 Pedido #${code(o.id)} recebido! Já já ele entra em preparo.`;
    case 'preparing': return `👨‍🍳 Seu pedido #${code(o.id)} está em preparo.`;
    case 'out_for_delivery': return pickup ? `🛍️ Seu pedido #${code(o.id)} está pronto para retirada!` : `🛵 Seu pedido #${code(o.id)} saiu para entrega!`;
    case 'delivered': return pickup ? `✅ Pedido #${code(o.id)} retirado. Obrigado e bom apetite!` : `✅ Pedido #${code(o.id)} entregue. Obrigado e bom apetite!`;
    case 'cancelled': return `❌ O pedido #${code(o.id)} foi cancelado. Se tiver dúvida, responda aqui que um atendente fala com você.`;
    default: return `Pedido #${code(o.id)}: ${o.delivery_status}`;
  }
}

const ORDER_COLS = 'id, restaurant_id, order_type, delivery_status, status, total, delivery_fee, customer_name, customer_phone, public_token, created_at';

async function latestOrderFor(admin: SupabaseClient, restaurantId: string, phone: string) {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const { data } = await admin.from('orders').select(ORDER_COLS)
    .eq('restaurant_id', restaurantId).in('order_type', ['delivery', 'takeaway']).gte('created_at', since)
    .like('customer_phone', `%${last8(phone)}`).order('created_at', { ascending: false }).limit(1);
  return (data?.[0] ?? null) as OrderRow | null;
}

const MENU = (link: string | null) => [
  link ? `1️⃣ Fazer pedido / ver cardápio` : null,
  `2️⃣ Acompanhar meu pedido`,
  `3️⃣ Horário e endereço`,
  `4️⃣ Falar com um atendente`,
].filter(Boolean).join('\n');

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Mensagem nova do cliente. Responde quando o robô está ligado e ninguém da equipe assumiu a conversa. */
export async function handleInbound(admin: SupabaseClient, restaurantId: string, conversationId: string, text: string) {
  const { data: conv } = await admin.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle() as { data: Conversation | null };
  if (!conv) return;
  const { settings, store, name, address } = await context(admin, restaurantId);
  if (!settings?.enabled) return;
  if (conv.bot_paused_until && new Date(conv.bot_paused_until).getTime() > Date.now()) return;

  const t = norm(text);
  const storeReady = !!store?.enabled;
  const link = storeReady ? storeLink(store!.slug, conv.phone) : null;
  const reply = (msg: string) => sendText(admin, restaurantId, conv, msg);

  // "Pedido #ABCD1234" (vem do botão da página de acompanhamento) → liga a conversa ao pedido.
  const ref = t.match(/\b([0-9a-f]{8})\b/);
  if (ref) {
    const { data: found } = await admin.from('orders').select(ORDER_COLS).eq('restaurant_id', restaurantId)
      .gte('id', `${ref[1]}-0000-0000-0000-000000000000`).lte('id', `${ref[1]}-ffff-ffff-ffff-ffffffffffff`).limit(1);
    const order = found?.[0] as OrderRow | undefined;
    if (order) {
      await admin.from('whatsapp_conversations').update({ last_order_id: order.id }).eq('id', conv.id);
      await reply(`${statusMessage(order)}\n\nVou te avisando por aqui a cada etapa. 😉`);
      return;
    }
  }

  if (t === '4' || /atendente|humano|pessoa|falar com/.test(t)) {
    const until = new Date(Date.now() + (settings.human_pause_minutes ?? 60) * 60_000).toISOString();
    await admin.from('whatsapp_conversations').update({ needs_human: true, bot_paused_until: until }).eq('id', conv.id);
    await reply('Certo! Um atendente vai te responder aqui em instantes. 🙋');
    return;
  }

  if (t === '2' || /acompanh|status|cade|meu pedido|demora/.test(t)) {
    const order = await latestOrderFor(admin, restaurantId, conv.phone);
    if (!order) { await reply(`Não encontrei pedido recente neste número.${link ? `\n\nPara pedir: ${link}` : ''}`); return; }
    await admin.from('whatsapp_conversations').update({ last_order_id: order.id }).eq('id', conv.id);
    await reply(statusMessage(order));
    return;
  }

  if (t === '3' || /horario|endereco|onde fica|aberto|funciona/.test(t)) {
    const lines = [store?.hours_text ? `🕒 ${store.hours_text}` : null, address ? `📍 ${address}` : null].filter(Boolean);
    await reply(lines.length ? lines.join('\n') : 'Responda 4 para falar com um atendente sobre horário e endereço.');
    return;
  }

  if (t === '1' || /cardapio|pedir|pedido|menu|fome|quero/.test(t)) {
    if (!link) { await reply('Responda 4 que um atendente anota seu pedido. 🙋'); return; }
    if (!store!.is_open) { await reply(settings.closed_message); return; }
    await reply(`Faça seu pedido por aqui 👇\n${link}\n\nVocê escolhe os itens, a entrega ou retirada e a forma de pagamento. Eu te aviso cada etapa por aqui.`);
    return;
  }

  // Qualquer outra mensagem: saudação + menu (sem repetir a saudação em sequência).
  const recent = conv.last_bot_at && Date.now() - new Date(conv.last_bot_at).getTime() < 3 * 60_000;
  const greeting = settings.greeting.replace(/\{restaurante\}/gi, name);
  const closed = storeReady && !store!.is_open ? `\n\n${settings.closed_message}` : '';
  await reply(recent ? `Não entendi 🤔 Responda com o número da opção:\n\n${MENU(link)}` : `${greeting}${closed}\n\nComo posso ajudar?\n\n${MENU(link)}`);
}

/** Pedido criado ou com status novo → avisa o cliente se ele conversou com o restaurante nas últimas 24 h. */
export async function handleOrderEvent(admin: SupabaseClient, orderId: string, event: 'created' | 'status') {
  const { data: order } = await admin.from('orders').select(ORDER_COLS).eq('id', orderId).maybeSingle() as { data: OrderRow | null };
  if (!order?.customer_phone) return { skipped: 'sem telefone' };
  const { settings, store } = await context(admin, order.restaurant_id);
  if (!settings?.enabled || !settings.notify_status) return { skipped: 'robô desligado' };

  const { data: convs } = await admin.from('whatsapp_conversations').select('*')
    .eq('restaurant_id', order.restaurant_id).like('phone', `%${last8(order.customer_phone)}`)
    .order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(1);
  const conv = convs?.[0] as Conversation | undefined;
  if (!conv?.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > WINDOW_MS) {
    return { skipped: 'cliente sem conversa aberta nas últimas 24 h' };
  }

  let msg = statusMessage(order);
  if (event === 'created') {
    const total = Number(order.total) + Number(order.delivery_fee || 0);
    msg = `✅ Recebemos seu pedido #${code(order.id)}, ${order.customer_name?.split(' ')[0] ?? ''}!\nTotal: ${brl(total)}`;
    if (store?.enabled && order.public_token) msg += `\n\nAcompanhe: ${trackLink(store.slug, order.id, order.public_token)}`;
  }
  await admin.from('whatsapp_conversations').update({ last_order_id: order.id }).eq('id', conv.id);
  await sendText(admin, order.restaurant_id, conv, msg);
  return { sent: true };
}
