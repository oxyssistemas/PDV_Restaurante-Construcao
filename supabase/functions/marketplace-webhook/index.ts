import { createClient } from 'npm:@supabase/supabase-js@2';
import { planAllows } from '../_shared/plan.ts';

// Pedidos de 99Food, Keeta e Rappi entrando sozinhos no sistema.
//   POST /marketplace-webhook/<app>/<chave da loja>   (app = 99food | keeta | rappi)
// A chave aparece em Admin → Apps de delivery. Se o segredo <APP>_WEBHOOK_SECRET existir na plataforma
// (FOOD99_WEBHOOK_SECRET, KEETA_WEBHOOK_SECRET ou RAPPI_WEBHOOK_SECRET), a assinatura HMAC-SHA256 do corpo é conferida (cabeçalho x-signature).
// O corpo pode vir no formato padrão do Oxys ou com os nomes de campo usuais desses apps; os campos que
// faltarem ficam em branco e o pedido original fica guardado para conferência.

const CHANNELS = new Set(['99food', 'keeta', 'rappi']);
const SECRET_NAMES: Record<string, string> = { '99food': 'FOOD99_WEBHOOK_SECRET', keeta: 'KEETA_WEBHOOK_SECRET', rappi: 'RAPPI_WEBHOOK_SECRET' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Any = Record<string, any>;
const pick = (o: Any | undefined, ...keys: string[]) => {
  for (const k of keys) {
    const v = k.split('.').reduce<any>((x, p) => (x == null ? undefined : x[p]), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};
/** Valores em centavos (inteiros grandes vindos de campos *_cents) viram reais. */
const money = (v: unknown, cents = false) => {
  if (v && typeof v === 'object') v = (v as Any).value ?? (v as Any).amount;
  const n = Number(v);
  return Number.isFinite(n) ? (cents ? n / 100 : n) : undefined;
};

/** Leva o pedido do app para o formato do Oxys. */
function normalize(body: Any) {
  const o: Any = body.order ?? body.data?.order ?? body.data ?? body;
  if (o.external_id && Array.isArray(o.items)) return o; // já está no formato padrão
  const customer = o.customer ?? o.client ?? o.user ?? o.consumer ?? {};
  const addr = o.delivery_address ?? o.address ?? o.delivery?.address ?? o.shipping_address;
  const address = typeof addr === 'string' ? addr
    : addr ? [pick(addr, 'street', 'street_name', 'address'), pick(addr, 'number', 'street_number'), pick(addr, 'complement'),
        pick(addr, 'neighborhood', 'district'), pick(addr, 'city'), pick(addr, 'reference')].filter(Boolean).join(', ') : undefined;
  const cents = 'total_cents' in o || 'amount_cents' in o;
  const rawItems: Any[] = o.items ?? o.products ?? o.order_items ?? o.lines ?? [];
  const mode = String(pick(o, 'type', 'delivery_type', 'order_type', 'fulfillment', 'delivery.mode') ?? '').toLowerCase();
  return {
    external_id: String(pick(o, 'id', 'order_id', 'orderId', 'uuid') ?? ''),
    display_id: pick(o, 'display_id', 'displayId', 'short_reference', 'shortReference', 'code', 'order_number', 'number'),
    type: /pick|takeaway|takeout|retir/.test(mode) ? 'takeaway' : 'delivery',
    customer: { name: pick(customer, 'name', 'full_name', 'first_name'), phone: pick(customer, 'phone', 'phone_number', 'phone.number', 'mobile') },
    address,
    notes: pick(o, 'notes', 'observation', 'observations', 'comments', 'instructions'),
    delivery_fee: money(pick(o, 'delivery_fee', 'deliveryFee', 'shipping', 'delivery_fee_cents', 'charges.delivery'), 'delivery_fee_cents' in o),
    total: money(pick(o, 'total', 'total_value', 'totalPrice', 'total_price', 'total_cents', 'amount', 'amount_cents', 'total.orderAmount'), cents),
    payment: {
      method: pick(o, 'payment.method', 'payment_method', 'payments.0.method'),
      prepaid: !/cash|dinheiro|on_delivery|offline/i.test(String(pick(o, 'payment.type', 'payment_type', 'payment.method', 'payment_method') ?? 'online')),
    },
    items: rawItems.map((i: Any) => {
      const itemCents = 'unit_price_cents' in i || 'price_cents' in i;
      return {
        code: String(pick(i, 'external_code', 'externalCode', 'sku', 'code', 'product_id', 'id') ?? ''),
        name: pick(i, 'name', 'title', 'description', 'product.name'),
        quantity: Number(pick(i, 'quantity', 'qty', 'units', 'amount') ?? 1),
        unit_price: money(pick(i, 'unit_price', 'unitPrice', 'price', 'unit_price_cents', 'price_cents'), itemCents),
        notes: pick(i, 'notes', 'observation', 'comments'),
      };
    }),
  };
}

async function validSignature(secret: string, raw: string, header: string | null) {
  if (!header) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  return header.replace(/^sha256=/i, '').toLowerCase() === hex;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true, info: 'Oxys: envie os pedidos com POST.' });
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const i = parts.findIndex(p => CHANNELS.has(p));
  const channel = i >= 0 ? parts[i] : '';
  const key = i >= 0 ? parts[i + 1] ?? '' : '';
  if (!channel || !UUID.test(key)) return json({ error: 'Endereço inválido' }, 404);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: integ } = await sb.from('marketplace_integrations').select('id, restaurant_id, enabled, channel').eq('webhook_key', key).eq('channel', channel).maybeSingle();
  if (!integ) return json({ error: 'Integração não encontrada' }, 404);

  const raw = await req.text();
  const secret = Deno.env.get(SECRET_NAMES[channel]);
  if (secret && !(await validSignature(secret, raw, req.headers.get('x-signature') ?? req.headers.get('x-hub-signature-256')))) {
    return json({ error: 'Assinatura inválida' }, 401);
  }
  if (!integ.enabled) return json({ ok: true, ignored: 'integração desligada' });
  if (!(await planAllows(sb, integ.restaurant_id, 'marketplaces'))) return json({ ok: true, ignored: 'fora do plano da loja' });

  let body: Any;
  try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    const event = String(pick(body, 'event', 'type', 'event_type', 'status', 'order.status') ?? '').toLowerCase();
    const o = normalize(body);
    // cancelamento vindo do app
    if (/cancel/.test(event) && o.external_id) {
      const { data: mo } = await sb.from('marketplace_orders').select('id, order_id').eq('channel', channel).eq('external_id', o.external_id).maybeSingle();
      if (mo?.order_id) {
        await sb.from('orders').update({ delivery_status: 'cancelled', status: 'cancelled' }).eq('id', mo.order_id);
        await sb.from('marketplace_orders').update({ status: 'cancelled' }).eq('id', mo.id);
      }
      await sb.from('marketplace_integrations').update({ last_event_at: new Date().toISOString() }).eq('id', integ.id);
      return json({ ok: true, cancelled: !!mo });
    }
    if (!o.external_id || !Array.isArray(o.items) || !o.items.length) {
      // evento sem pedido (status, teste de conexão): só registra que chegou
      await sb.from('marketplace_integrations').update({ last_event_at: new Date().toISOString() }).eq('id', integ.id);
      return json({ ok: true, ignored: 'evento sem itens' });
    }
    const { data: orderId, error } = await sb.rpc('create_marketplace_order', { _integration: integ.id, _o: o });
    if (error) throw error;
    return json({ ok: true, orderId });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    await sb.from('marketplace_integrations').update({ last_error: msg.slice(0, 300), last_event_at: new Date().toISOString() }).eq('id', integ.id);
    console.error('marketplace-webhook', channel, msg);
    return json({ error: msg }, 400);
  }
});
