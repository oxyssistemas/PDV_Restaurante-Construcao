import { createClient } from 'npm:@supabase/supabase-js@2';

// Loja online do restaurante (sem login): www.oxysrestaurante.app/pedir/<slug>
//   { action: 'store', slug }                       → dados da loja e cardápio
//   { action: 'order', slug, order }                → cria o pedido (preço e taxa calculados no banco)
//   { action: 'status', orderId, token }            → acompanhamento do pedido

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type DB = ReturnType<typeof db>;

async function signed(sb: DB, path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const { data } = await sb.storage.from('menu-images').createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

async function storeBySlug(sb: DB, slug: string) {
  const { data } = await sb.from('delivery_stores').select('*, restaurants!inner(id, name, status)').eq('slug', slug).maybeSingle();
  const r = (data as any)?.restaurants;
  if (!data || !data.enabled || r?.status !== 'active') return null;
  return data as any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'store');
    const sb = db();

    if (action === 'store') {
      const slug = String(body?.slug ?? '').toLowerCase();
      if (!SLUG.test(slug)) return json({ error: 'Loja não encontrada.' }, 404);
      const store = await storeBySlug(sb, slug);
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);
      const rid = store.restaurant_id;
      const [{ data: categories }, { data: items }, { data: branding }] = await Promise.all([
        sb.from('menu_categories').select('id, name, sort_order').eq('restaurant_id', rid).order('sort_order'),
        sb.from('menu_items').select('id, name, description, price, image_url, category_id').eq('restaurant_id', rid).eq('available', true).order('name'),
        sb.from('branding_settings').select('brand_name, logo_light_url, logo_dark_url').eq('restaurant_id', rid).maybeSingle(),
      ]);
      const withImages = await Promise.all((items ?? []).map(async i => ({ ...i, price: Number(i.price), image_url: await signed(sb, i.image_url) })));
      return json({
        store: {
          slug: store.slug,
          name: branding?.brand_name?.trim() || store.restaurants.name,
          logo: await signed(sb, branding?.logo_light_url || branding?.logo_dark_url),
          is_open: store.is_open,
          delivery_enabled: store.delivery_enabled,
          pickup_enabled: store.pickup_enabled,
          min_order: Number(store.min_order),
          default_fee: Number(store.default_fee),
          zones: (store.zones ?? []).map((z: any) => ({ name: String(z.name), fee: Number(z.fee) })),
          eta_minutes: store.eta_minutes,
          pickup_eta_minutes: store.pickup_eta_minutes,
          payment_methods: store.payment_methods,
          whatsapp: store.whatsapp,
          address: store.address,
          hours_text: store.hours_text,
          notice: store.notice,
        },
        categories: categories ?? [],
        items: withImages,
      });
    }

    if (action === 'order') {
      const slug = String(body?.slug ?? '').toLowerCase();
      if (!SLUG.test(slug)) return json({ error: 'Loja não encontrada.' }, 404);
      const o = body?.order ?? {};
      const items = Array.isArray(o.items) ? o.items.slice(0, 40).map((i: any) => ({
        menu_item_id: UUID.test(String(i?.menu_item_id ?? '')) ? String(i.menu_item_id) : '00000000-0000-0000-0000-000000000000',
        quantity: Number(i?.quantity ?? 0),
        notes: typeof i?.notes === 'string' ? i.notes.slice(0, 300) : null,
      })) : [];
      const payload = {
        name: String(o.name ?? '').slice(0, 80), phone: String(o.phone ?? '').slice(0, 20),
        mode: o.mode === 'pickup' ? 'pickup' : 'delivery', channel: o.channel === 'whatsapp' ? 'whatsapp' : 'site',
        address: String(o.address ?? '').slice(0, 300), zone: String(o.zone ?? '').slice(0, 80),
        payment: String(o.payment ?? '').slice(0, 20), change_for: o.change_for ? String(o.change_for).slice(0, 12) : '',
        notes: String(o.notes ?? '').slice(0, 500), items,
      };
      const { data, error } = await sb.rpc('create_online_order', { _slug: slug, _order: payload });
      if (error) return json({ error: error.message }, 400);
      const row = (data as any[])?.[0];
      return json({ orderId: row.order_id, token: row.public_token });
    }

    if (action === 'status') {
      const orderId = String(body?.orderId ?? '');
      const token = String(body?.token ?? '');
      if (!UUID.test(orderId) || !UUID.test(token)) return json({ error: 'Pedido não encontrado.' }, 404);
      const { data: order } = await sb.from('orders')
        .select('id, restaurant_id, order_type, delivery_status, total, delivery_fee, customer_name, customer_address, payment_hint, change_for, created_at, order_items(quantity, unit_price, status, notes, menu_items(name))')
        .eq('id', orderId).eq('public_token', token).maybeSingle();
      if (!order) return json({ error: 'Pedido não encontrado.' }, 404);
      const { data: store } = await sb.from('delivery_stores').select('slug, whatsapp, eta_minutes, pickup_eta_minutes').eq('restaurant_id', order.restaurant_id).maybeSingle();
      const { restaurant_id: _r, ...rest } = order as any;
      return json({ order: { ...rest, code: order.id.slice(0, 8).toUpperCase() }, store });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('delivery-store', e);
    return json({ error: 'Erro inesperado. Tente novamente.' }, 500);
  }
});
