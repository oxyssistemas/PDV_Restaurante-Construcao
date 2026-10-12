import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { dedicatedFor, relay } from '../_shared/relay.ts';
import { planAllows } from '../_shared/plan.ts';
import { MENU_ITEM_FIELDS, activePromos, cleanOptions, withOptions } from '../_shared/menu.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'menu');
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!UUID.test(token)) return json({ error: 'QR Code inválido.' }, 400);

    const db = admin();

    // loja com servidor dedicado (o QR leva ?r=<loja>): o servidor da loja responde
    if (typeof body?.r === 'string' && UUID.test(body.r)) {
      const target = await dedicatedFor(db as any, { restaurantId: body.r });
      if (target) return relay(target, 'public-menu', body);
    }

    const { data: table } = await db
      .from('restaurant_tables')
      .select('id, number, restaurant_id, qr_enabled, rodizio_id, restaurants!inner(id, name, status)')
      .eq('qr_token', token)
      .maybeSingle();

    const restaurant = (table as any)?.restaurants;
    if (!table || !table.qr_enabled || restaurant?.status !== 'active') {
      return json({ error: 'Este QR Code não está disponível no momento.' }, 404);
    }
    if (!(await planAllows(db, table.restaurant_id, 'qr_menu'))) {
      return json({ error: 'O cardápio pelo QR Code não está ativo nesta loja. Chame o garçom.' }, 403);
    }

    if (action === 'menu') {
      let itemsQuery = db.from('menu_items').select(MENU_ITEM_FIELDS)
        .eq('restaurant_id', table.restaurant_id).eq('available', true).order('name');
      // mesa em rodízio: só os pratos do rodízio, sem preço; o resto é pedido ao garçom
      if (table.rodizio_id) itemsQuery = itemsQuery.contains('rodizio_ids', [table.rodizio_id]);
      const [{ data: categories }, { data: items }, { data: branding }, { data: rodizio }] = await Promise.all([
        db.from('menu_categories').select('id, name, sort_order')
          .eq('restaurant_id', table.restaurant_id).order('sort_order'),
        itemsQuery,
        db.from('branding_settings').select('brand_name, logo_light_url, logo_dark_url')
          .eq('restaurant_id', table.restaurant_id).maybeSingle(),
        table.rodizio_id
          ? db.from('rodizios').select('name, description').eq('id', table.rodizio_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const withImages = await Promise.all((await withOptions(db, table.restaurant_id, items ?? [])).map(async (item) => {
        let image: string | null = null;
        const path = item.image_url;
        if (path) {
          if (path.startsWith('http')) image = path;
          else {
            const { data } = await db.storage.from('menu-images').createSignedUrl(path, 60 * 60);
            image = data?.signedUrl ?? null;
          }
        }
        return table.rodizio_id ? { ...item, image_url: image, price: 0, in_rodizio: true } : { ...item, image_url: image };
      }));

      let logo: string | null = null;
      const logoPath = branding?.logo_light_url || branding?.logo_dark_url;
      if (logoPath) {
        if (logoPath.startsWith('http')) logo = logoPath;
        else {
          const { data } = await db.storage.from('menu-images').createSignedUrl(logoPath, 60 * 60);
          logo = data?.signedUrl ?? null;
        }
      }

      return json({
        restaurant: { name: branding?.brand_name?.trim() || restaurant.name, logo },
        table: { number: table.number },
        rodizio: rodizio ?? null,
        categories: categories ?? [],
        items: withImages,
        auto_promotions: table.rodizio_id ? [] : await activePromos(db, table.restaurant_id, 'salon'),
      });
    }

    if (action === 'order') {
      const customerName = typeof body?.customerName === 'string' ? body.customerName : '';
      const items = Array.isArray(body?.items) ? body.items : [];
      const payload = items.slice(0, 30).map((i: any) => ({
        menu_item_id: String(i?.menu_item_id ?? ''),
        quantity: Number(i?.quantity ?? 0),
        notes: typeof i?.notes === 'string' ? i.notes.slice(0, 300) : null,
        options: cleanOptions(i?.options),
      }));

      const { data, error } = await db.rpc('create_qr_order', {
        _qr_token: token,
        _customer_name: customerName,
        _items: payload,
      });

      if (error) return json({ error: error.message }, 400);
      return json({ orderId: data });
    }

    if (action === 'call_waiter' || action === 'bill') {
      // botão "Chamar garçom" / "Pedir a conta" da mesa (no máximo um a cada 45 s)
      const type = action === 'bill' ? 'bill_request' : 'waiter_call';
      const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('table_id', table.id).eq('type', type).gte('created_at', new Date(Date.now() - 45_000).toISOString());
      if (!count) {
        const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 140) : '';
        const { error } = await db.from('notifications').insert({
          restaurant_id: table.restaurant_id, table_id: table.id, type,
          title: type === 'bill_request' ? `Mesa ${table.number} pediu a conta` : `Mesa ${table.number} chamou o garçom`,
          message: reason || (type === 'bill_request' ? 'O cliente pediu a conta pelo QR da mesa.' : 'O cliente chamou pelo QR da mesa.'),
          target_roles: type === 'bill_request' ? ['waiter', 'cashier', 'admin'] : ['waiter'],
        });
        if (error) return json({ error: 'Não foi possível chamar o garçom.' }, 500);
      }
      return json({ ok: true });
    }

    if (action === 'status') {
      const { data: orders } = await db
        .from('orders')
        .select('id, status, total, customer_name, created_at, order_items(quantity, status, options_text, menu_items(name))')
        .eq('table_id', table.id)
        .eq('source', 'qr')
        .is('archived_at', null)
        .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      return json({ orders: orders ?? [] });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
