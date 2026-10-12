import { createClient } from 'npm:@supabase/supabase-js@2';
import { planAllows } from '../_shared/plan.ts';
import { MENU_ITEM_FIELDS, activePromos, cleanOptions, withOptions } from '../_shared/menu.ts';

// Autoatendimento (totem / tablet no balcão), sem login: www.oxysrestaurante.app/totem/<chave do totem>
//   { action: 'menu', token }          → loja, configuração do totem e cardápio
//   { action: 'order', token, order }  → cria o pedido (preço calculado no banco) e devolve a senha

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '');
    if (!UUID.test(token)) return json({ error: 'Totem não encontrado.' }, 404);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    const { data: kiosk } = await sb.from('kiosks').select('*, restaurants!inner(id, name, status)').eq('token', token).maybeSingle();
    const restaurant = (kiosk as any)?.restaurants;
    if (!kiosk || !kiosk.enabled || restaurant?.status !== 'active') return json({ error: 'Este totem está desativado no momento.' }, 404);
    const rid = kiosk.restaurant_id;
    if (!(await planAllows(sb, rid, 'kiosk'))) return json({ error: 'O autoatendimento não está ativo nesta loja.' }, 403);

    if (body?.action === 'order') {
      const o = body?.order ?? {};
      const items = Array.isArray(o.items) ? o.items.slice(0, 40).map((i: any) => ({
        menu_item_id: UUID.test(String(i?.menu_item_id ?? '')) ? String(i.menu_item_id) : '',
        quantity: Number(i?.quantity ?? 0),
        notes: typeof i?.notes === 'string' ? i.notes.slice(0, 200) : null,
        options: cleanOptions(i?.options),
      })) : [];
      const { data, error } = await sb.rpc('create_kiosk_order', {
        _token: token,
        _order: { name: String(o.name ?? '').slice(0, 40), phone: String(o.phone ?? '').slice(0, 20), mode: o.mode === 'eat_in' ? 'eat_in' : 'takeaway', items },
      });
      if (error) return json({ error: error.message }, 400);
      const row = (data as any[])?.[0];
      return json({ orderId: row.order_id, ticket: row.ticket_number, total: Number(row.total) });
    }

    // cardápio
    await sb.from('kiosks').update({ last_seen_at: new Date().toISOString() }).eq('id', kiosk.id);
    const [{ data: categories }, { data: items }, { data: branding }, { data: store }] = await Promise.all([
      sb.from('menu_categories').select('id, name, sort_order').eq('restaurant_id', rid).order('sort_order'),
      sb.from('menu_items').select(MENU_ITEM_FIELDS).eq('restaurant_id', rid).eq('available', true).order('name'),
      sb.from('branding_settings').select('brand_name, logo_light_url, logo_dark_url').eq('restaurant_id', rid).maybeSingle(),
      sb.from('delivery_stores').select('featured_item_ids').eq('restaurant_id', rid).maybeSingle(),
    ]);
    const signed = async (path: string | null | undefined) => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      const { data } = await sb.storage.from('menu-images').createSignedUrl(path, 60 * 60 * 12);
      return data?.signedUrl ?? null;
    };
    const withImages = await Promise.all((await withOptions(sb, rid, items ?? [])).map(async i => ({ ...i, price: Number(i.price), image_url: await signed(i.image_url) })));
    const available = new Set(withImages.map(i => i.id));
    return json({
      restaurant: { name: branding?.brand_name?.trim() || restaurant.name, logo: await signed(branding?.logo_light_url || branding?.logo_dark_url) },
      kiosk: {
        name: kiosk.name, eat_in: kiosk.eat_in_enabled, takeaway: kiosk.takeaway_enabled, ask_phone: kiosk.ask_phone,
        welcome: kiosk.welcome_text, idle_seconds: kiosk.idle_seconds,
      },
      featured: ((store?.featured_item_ids ?? []) as string[]).filter(id => available.has(id)),
      categories: categories ?? [],
      items: withImages,
      auto_promotions: await activePromos(sb, rid, 'counter'),
    });
  } catch (e) {
    console.error('kiosk', e);
    return json({ error: 'Erro inesperado. Chame um atendente.' }, 500);
  }
});
