import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

    const { data: table } = await db
      .from('restaurant_tables')
      .select('id, number, restaurant_id, qr_enabled, restaurants!inner(id, name, status)')
      .eq('qr_token', token)
      .maybeSingle();

    const restaurant = (table as any)?.restaurants;
    if (!table || !table.qr_enabled || restaurant?.status !== 'active') {
      return json({ error: 'Este QR Code não está disponível no momento.' }, 404);
    }

    if (action === 'menu') {
      const [{ data: categories }, { data: items }, { data: branding }] = await Promise.all([
        db.from('menu_categories').select('id, name, sort_order')
          .eq('restaurant_id', table.restaurant_id).order('sort_order'),
        db.from('menu_items').select('id, name, description, price, image_url, category_id')
          .eq('restaurant_id', table.restaurant_id).eq('available', true).order('name'),
        db.from('branding_settings').select('brand_name, logo_light_url, logo_dark_url')
          .eq('restaurant_id', table.restaurant_id).maybeSingle(),
      ]);

      const withImages = await Promise.all((items ?? []).map(async (item) => {
        let image: string | null = null;
        const path = item.image_url;
        if (path) {
          if (path.startsWith('http')) image = path;
          else {
            const { data } = await db.storage.from('menu-images').createSignedUrl(path, 60 * 60);
            image = data?.signedUrl ?? null;
          }
        }
        return { ...item, image_url: image };
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
        categories: categories ?? [],
        items: withImages,
      });
    }

    if (action === 'order') {
      const customerName = typeof body?.customerName === 'string' ? body.customerName : '';
      const items = Array.isArray(body?.items) ? body.items : [];
      const payload = items.slice(0, 30).map((i: any) => ({
        menu_item_id: String(i?.menu_item_id ?? ''),
        quantity: Number(i?.quantity ?? 0),
        notes: typeof i?.notes === 'string' ? i.notes.slice(0, 300) : null,
      }));

      const { data, error } = await db.rpc('create_qr_order', {
        _qr_token: token,
        _customer_name: customerName,
        _items: payload,
      });

      if (error) return json({ error: error.message }, 400);
      return json({ orderId: data });
    }

    if (action === 'status') {
      const { data: orders } = await db
        .from('orders')
        .select('id, status, total, customer_name, created_at, order_items(quantity, status, menu_items(name))')
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
