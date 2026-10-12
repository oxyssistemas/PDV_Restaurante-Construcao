import { createClient } from 'npm:@supabase/supabase-js@2';
import { dedicatedFor, relay, type DedicatedTarget } from '../_shared/relay.ts';
import { planAllows } from '../_shared/plan.ts';
import { MENU_ITEM_FIELDS, activePromos, cleanOptions, withOptions } from '../_shared/menu.ts';
import { geocode, withCity } from '../_shared/geo.ts';

// Loja online do restaurante (sem login): www.oxysrestaurante.app/pedir/<slug>
//   { action: 'store', slug }                       → dados da loja e cardápio
//   { action: 'order', slug, order }                → cria o pedido (preço e taxa calculados no banco)
//   { action: 'status', slug?, orderId, token }     → acompanhamento do pedido
//   { action: 'coupon', slug, code, subtotal, fee } → confere o cupom e mostra o desconto (prévia da sacola)
//   { action: 'quote', slug, address }              → taxa de entrega por km (loja com taxa por distância)
//   { action: 'geocode_store', slug }               → equipe da loja: acha a loja no mapa (taxa por km e mapa do delivery)
//   { action: 'geocode_orders', restaurantId }       → equipe: põe no mapa os pedidos de entrega em aberto
//   { action: 'signup', slug, name, phone, email, password } → cria a conta do cliente (já confirmada)
//   { action: 'me', slug, profile? }                → conta do cliente logado: dados, ficha no CRM e "Meus pedidos"
// "order" e "me" exigem o cliente logado (token da sessão da loja no Authorization).

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

/** Imagem do bucket público da vitrine (foto enviada pela loja ou sugestão). */
const mediaUrl = (path: string | null | undefined) =>
  !path ? null : path.startsWith('http') ? path : `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/store-media/${path.split('/').map(encodeURIComponent).join('/')}`;

const phone55 = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11 ? `55${d}` : d;
};

/** Cliente logado na loja (ou null). Sem login o Authorization traz só a chave pública. */
async function currentUser(sb: DB, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token === Deno.env.get('SUPABASE_ANON_KEY')) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}

/** Saldo de cashback do cliente na loja (para usar no pedido). */
async function cashbackFor(sb: DB, restaurantId: string, phone: string | null | undefined) {
  if (!phone) return null;
  const { data: p } = await sb.from('loyalty_programs').select('enabled, mode, cashback_percent').eq('restaurant_id', restaurantId).maybeSingle();
  if (!p?.enabled || p.mode !== 'cashback') return null;
  const { data: on } = await sb.rpc('restaurant_has_feature', { _restaurant_id: restaurantId, _feature: 'loyalty' });
  if (on === false) return null;
  const { data: acc } = await sb.from('loyalty_accounts').select('cashback_balance').eq('restaurant_id', restaurantId).eq('customer_phone', phone).maybeSingle();
  return { balance: Number(acc?.cashback_balance ?? 0), percent: Number(p.cashback_percent) };
}

/** Loja com servidor dedicado: a nuvem só confirma o cliente e repassa para o servidor da loja. */
async function dedicatedStore(sb: DB, slug: string): Promise<DedicatedTarget | 'offline' | null> {
  if (!SLUG.test(slug)) return null;
  const { data } = await sb.from('delivery_stores').select('restaurant_id').eq('slug', slug).maybeSingle();
  if (data) return await dedicatedFor(sb as any, { restaurantId: data.restaurant_id });
  return await dedicatedFor(sb as any, { slug });
}

async function storeBySlug(sb: DB, slug: string) {
  const { data } = await sb.from('delivery_stores').select('*, restaurants!inner(id, name, status)').eq('slug', slug).maybeSingle();
  const r = (data as any)?.restaurants;
  if (!data || !data.enabled || r?.status !== 'active') return null;
  // loja online fora do plano: fica como se não existisse
  if (!(await planAllows(sb, data.restaurant_id, 'online_store'))) return null;
  return data as any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'store');
    const sb = db();

    // ---------- loja com servidor dedicado ----------
    const dedicated = await dedicatedStore(sb, String(body?.slug ?? '').toLowerCase());
    if (dedicated) {
      if (action === 'store' || action === 'status' || action === 'coupon' || action === 'quote') return relay(dedicated, 'delivery-store', body);
      const user = await currentUser(sb, req);
      if (action === 'signup') {
        // conta do cliente fica na nuvem; a ficha dele no CRM fica no servidor da loja
        const name = String(body?.name ?? '').trim().slice(0, 80);
        const phone = phone55(body?.phone);
        const email = String(body?.email ?? '').trim().toLowerCase();
        const password = String(body?.password ?? '');
        if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
        if (!/^\d{12,13}$/.test(phone)) return json({ error: 'Informe um WhatsApp com DDD.' }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: 'Informe um email válido.' }, 400);
        if (password.length < 6 || password.length > 72) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
        const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, phone, kind: 'store_customer' } });
        if (error || !created.user) {
          const exists = /already|registered|exists/i.test(error?.message ?? '');
          return json({ error: exists ? 'Este email já tem conta. Entre com sua senha.' : 'Não foi possível criar a conta.' }, exists ? 409 : 400);
        }
        await sb.from('customer_profiles').upsert({ user_id: created.user.id, name, phone });
        await relay(dedicated, 'delivery-store', { action: 'link', slug: body.slug }, { user: { id: created.user.id, email }, profile: { name, phone, address: null, complement: null } });
        return json({ ok: true });
      }
      if (!user) return json({ error: action === 'order' ? 'Entre na sua conta para fazer o pedido.' : 'Entre na sua conta.' }, 401);
      let { data: profile } = await sb.from('customer_profiles').select('name, phone, address, complement').eq('user_id', user.id).maybeSingle();
      if (action === 'me') {
        const p = body?.profile;
        if (p || !profile) {
          const name = String(p?.name ?? profile?.name ?? user.user_metadata?.name ?? '').trim().slice(0, 80);
          const phone = phone55(p?.phone ?? profile?.phone ?? user.user_metadata?.phone);
          if (name.length >= 2 && /^\d{12,13}$/.test(phone)) {
            const row = { user_id: user.id, name, phone, ...(p ? { address: String(p.address ?? '').trim().slice(0, 200) || null, complement: String(p.complement ?? '').trim().slice(0, 90) || null } : {}) };
            const { data } = await sb.from('customer_profiles').upsert(row).select('name, phone, address, complement').single();
            profile = data;
          } else if (p) {
            return json({ error: 'Informe nome e WhatsApp com DDD.' }, 400);
          }
        }
        const res = await relay(dedicated, 'delivery-store', { action: 'me', slug: body.slug }, { user: { id: user.id, email: user.email }, profile });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) return json(out, res.status);
        return json({ email: user.email, profile, orders: out.orders ?? [], cashback: out.cashback ?? null });
      }
      if (action === 'order') {
        const o = body?.order ?? {};
        const res = await relay(dedicated, 'delivery-store', { action: 'order', slug: body.slug, order: o }, { user: { id: user.id, email: user.email }, profile });
        if (res.ok) {
          // mesma conta do cliente na nuvem: guarda o último telefone e endereço (como no pedido da nuvem)
          const name = String(o.name ?? '').trim().slice(0, 80);
          const phone = phone55(o.phone);
          if (name.length >= 2 && /^\d{12,13}$/.test(phone)) {
            await sb.from('customer_profiles').upsert({
              user_id: user.id, name, phone,
              ...(o.mode !== 'pickup' ? { address: String(o.address_line ?? '').trim().slice(0, 200) || null, complement: String(o.complement ?? '').trim().slice(0, 90) || null } : {}),
            });
          }
        }
        return res;
      }
      return json({ error: 'Ação inválida.' }, 400);
    }

    if (action === 'store') {
      const slug = String(body?.slug ?? '').toLowerCase();
      if (!SLUG.test(slug)) return json({ error: 'Loja não encontrada.' }, 404);
      const store = await storeBySlug(sb, slug);
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);
      const rid = store.restaurant_id;
      const [{ data: categories }, { data: items }, { data: branding }, { data: promos }] = await Promise.all([
        sb.from('menu_categories').select('id, name, sort_order').eq('restaurant_id', rid).order('sort_order'),
        sb.from('menu_items').select(MENU_ITEM_FIELDS).eq('restaurant_id', rid).eq('available', true).order('name'),
        sb.from('branding_settings').select('brand_name, logo_light_url, logo_dark_url').eq('restaurant_id', rid).maybeSingle(),
        sb.from('delivery_promotions').select('id, title, subtitle, image, menu_item_id').eq('restaurant_id', rid).eq('active', true).order('sort_order').order('created_at'),
      ]);
      const withImages = await Promise.all((await withOptions(sb, rid, items ?? [])).map(async i => ({ ...i, price: Number(i.price), image_url: await signed(sb, i.image_url) })));
      const available = new Set(withImages.map(i => i.id));
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
          zones: store.fee_mode === 'distance' ? [] : (store.zones ?? []).map((z: any) => ({ name: String(z.name), fee: Number(z.fee) })),
          fee_mode: store.fee_mode, max_km: store.max_km == null ? null : Number(store.max_km),
          eta_minutes: store.eta_minutes,
          pickup_eta_minutes: store.pickup_eta_minutes,
          payment_methods: store.payment_methods,
          whatsapp: store.whatsapp,
          address: store.address,
          hours_text: store.hours_text,
          notice: store.notice,
          hero: {
            title: store.hero_title || null,
            highlight: store.hero_highlight || null,
            subtitle: store.hero_subtitle || null,
            image: mediaUrl(store.hero_image),
          },
          featured_item_ids: ((store.featured_item_ids ?? []) as string[]).filter(id => available.has(id)),
        },
        promotions: (promos ?? []).map(p => ({
          id: p.id, title: p.title, subtitle: p.subtitle, image: mediaUrl(p.image),
          menu_item_id: p.menu_item_id && available.has(p.menu_item_id) ? p.menu_item_id : null,
        })),
        categories: categories ?? [],
        items: withImages,
        auto_promotions: await activePromos(sb, rid, 'delivery'),
      });
    }

    if (action === 'signup') {
      const slug = String(body?.slug ?? '').toLowerCase();
      const store = SLUG.test(slug) ? await storeBySlug(sb, slug) : null;
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);
      const name = String(body?.name ?? '').trim().slice(0, 80);
      const phone = phone55(body?.phone);
      const email = String(body?.email ?? '').trim().toLowerCase();
      const password = String(body?.password ?? '');
      if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
      if (!/^\d{12,13}$/.test(phone)) return json({ error: 'Informe um WhatsApp com DDD.' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: 'Informe um email válido.' }, 400);
      if (password.length < 6 || password.length > 72) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name, phone, kind: 'store_customer' },
      });
      if (error || !created.user) {
        const exists = /already|registered|exists/i.test(error?.message ?? '');
        return json({ error: exists ? 'Este email já tem conta. Entre com sua senha.' : 'Não foi possível criar a conta.' }, exists ? 409 : 400);
      }
      await sb.from('customer_profiles').upsert({ user_id: created.user.id, name, phone });
      await sb.rpc('link_store_customer', { _restaurant_id: store.restaurant_id, _user_id: created.user.id });
      return json({ ok: true });
    }

    if (action === 'me') {
      const user = await currentUser(sb, req);
      if (!user) return json({ error: 'Entre na sua conta.' }, 401);
      const slug = String(body?.slug ?? '').toLowerCase();
      const store = SLUG.test(slug) ? await storeBySlug(sb, slug) : null;
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);

      const p = body?.profile;
      let { data: profile } = await sb.from('customer_profiles').select('name, phone, address, complement').eq('user_id', user.id).maybeSingle();
      if (p || !profile) {
        // Salva os dados enviados ou, no primeiro acesso, os do cadastro (contas criadas em outro lugar podem não ter telefone).
        const name = String(p?.name ?? profile?.name ?? user.user_metadata?.name ?? '').trim().slice(0, 80);
        const phone = phone55(p?.phone ?? profile?.phone ?? user.user_metadata?.phone);
        if (name.length >= 2 && /^\d{12,13}$/.test(phone)) {
          const row = { user_id: user.id, name, phone, ...(p ? { address: String(p.address ?? '').trim().slice(0, 200) || null, complement: String(p.complement ?? '').trim().slice(0, 90) || null } : {}) };
          const { data } = await sb.from('customer_profiles').upsert(row).select('name, phone, address, complement').single();
          profile = data;
        } else if (p) {
          return json({ error: 'Informe nome e WhatsApp com DDD.' }, 400);
        }
      }
      if (profile) await sb.rpc('link_store_customer', { _restaurant_id: store.restaurant_id, _user_id: user.id });

      const { data: orders } = await sb.from('orders')
        .select('id, created_at, delivery_status, order_type, total, delivery_fee, discount, public_token, order_items(quantity, status, options_text, menu_items(name))')
        .eq('restaurant_id', store.restaurant_id).eq('customer_user_id', user.id)
        .order('created_at', { ascending: false }).limit(20);
      return json({
        email: user.email,
        profile,
        orders: (orders ?? []).map(o => ({ ...o, code: o.id.slice(0, 8).toUpperCase() })),
        cashback: await cashbackFor(sb, store.restaurant_id, profile?.phone),
      });
    }

    if (action === 'order') {
      const slug = String(body?.slug ?? '').toLowerCase();
      if (!SLUG.test(slug)) return json({ error: 'Loja não encontrada.' }, 404);
      if (!(await storeBySlug(sb, slug))) return json({ error: 'Loja não encontrada.' }, 404);
      const user = await currentUser(sb, req);
      if (!user) return json({ error: 'Entre na sua conta para fazer o pedido.' }, 401);
      const o = body?.order ?? {};
      const items = Array.isArray(o.items) ? o.items.slice(0, 40).map((i: any) => ({
        menu_item_id: UUID.test(String(i?.menu_item_id ?? '')) ? String(i.menu_item_id) : '00000000-0000-0000-0000-000000000000',
        quantity: Number(i?.quantity ?? 0),
        notes: typeof i?.notes === 'string' ? i.notes.slice(0, 300) : null,
        options: cleanOptions(i?.options),
      })) : [];
      const payload = {
        name: String(o.name ?? '').slice(0, 80), phone: String(o.phone ?? '').slice(0, 20),
        mode: o.mode === 'pickup' ? 'pickup' : 'delivery', channel: o.channel === 'whatsapp' ? 'whatsapp' : 'site',
        address: String(o.address ?? '').slice(0, 300), zone: String(o.zone ?? '').slice(0, 80),
        payment: String(o.payment ?? '').slice(0, 20), change_for: o.change_for ? String(o.change_for).slice(0, 12) : '',
        notes: String(o.notes ?? '').slice(0, 500), items,
        address_line: String(o.address_line ?? '').slice(0, 200), complement: String(o.complement ?? '').slice(0, 90),
        use_cashback: o.use_cashback === true,
        coupon: String(o.coupon ?? '').trim().slice(0, 20),
      } as Record<string, unknown>;
      // taxa por km: o endereço vira coordenada aqui no servidor
      const st = await storeBySlug(sb, slug);
      if (st?.fee_mode === 'distance' && payload.mode === 'delivery') {
        const g = await geocode(sb, withCity(String(o.address_line ?? o.address ?? '').slice(0, 200), st.address));
        if (!g) return json({ error: 'Não encontramos esse endereço no mapa. Confira rua, número, bairro e cidade.' }, 400);
        payload.geo = { lat: g.lat, lng: g.lng };
      }
      const { data, error } = await sb.rpc('create_online_order', { _slug: slug, _order: payload, _user_id: user.id });
      if (error) return json({ error: error.message }, 400);
      const row = (data as any[])?.[0];
      return json({ orderId: row.order_id, token: row.public_token });
    }

    if (action === 'quote') {
      const slug = String(body?.slug ?? '').toLowerCase();
      const store = SLUG.test(slug) ? await storeBySlug(sb, slug) : null;
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);
      if (store.fee_mode !== 'distance') return json({ mode: 'zones' });
      const g = await geocode(sb, withCity(String(body?.address ?? '').slice(0, 200), store.address));
      if (!g) return json({ error: 'Não encontramos esse endereço no mapa. Confira rua, número, bairro e cidade.' }, 400);
      const { data } = await sb.rpc('delivery_fee_by_km', { _restaurant_id: store.restaurant_id, _lat: g.lat, _lng: g.lng });
      const r = data as any;
      if (!r?.ok) return json({ error: r?.error ?? 'Não foi possível calcular a entrega.', km: r?.km ?? null }, 400);
      return json({ mode: 'distance', km: Number(r.km), fee: Number(r.fee), lat: g.lat, lng: g.lng, label: g.label });
    }

    if (action === 'geocode_store') {
      const user = await currentUser(sb, req);
      if (!user) return json({ error: 'Entre no sistema.' }, 401);
      const slug = String(body?.slug ?? '').toLowerCase();
      const { data: st } = await sb.from('delivery_stores').select('restaurant_id, address').eq('slug', slug).maybeSingle();
      if (!st) return json({ error: 'Loja não encontrada.' }, 404);
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', user.id).eq('restaurant_id', st.restaurant_id);
      if (!(roles ?? []).some((r: any) => ['admin', 'manager', 'supervisor', 'delivery'].includes(r.role))) return json({ error: 'Sem permissão.' }, 403);
      if (!st.address) return json({ error: 'Preencha o endereço da loja.' }, 400);
      const g = await geocode(sb, st.address);
      if (!g) return json({ error: 'Não encontramos o endereço da loja no mapa. Escreva rua, número, bairro e cidade.' }, 400);
      await sb.from('delivery_stores').update({ lat: g.lat, lng: g.lng }).eq('restaurant_id', st.restaurant_id);
      return json({ lat: g.lat, lng: g.lng, label: g.label });
    }

    if (action === 'geocode_orders') {
      // equipe: coloca no mapa os pedidos de entrega em aberto que ainda não têm coordenada (até 10 por vez)
      const user = await currentUser(sb, req);
      if (!user) return json({ error: 'Entre no sistema.' }, 401);
      const rid = String(body?.restaurantId ?? '');
      if (!UUID.test(rid)) return json({ error: 'Loja inválida.' }, 400);
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', user.id).eq('restaurant_id', rid);
      if (!(roles ?? []).some((r: any) => ['admin', 'manager', 'supervisor', 'delivery', 'cashier'].includes(r.role))) return json({ error: 'Sem permissão.' }, 403);
      const { data: st } = await sb.from('delivery_stores').select('address, lat, lng').eq('restaurant_id', rid).maybeSingle();
      const { data: list } = await sb.from('orders').select('id, customer_address')
        .eq('restaurant_id', rid).eq('order_type', 'delivery').is('archived_at', null).is('delivery_lat', null)
        .in('delivery_status', ['pending', 'preparing', 'out_for_delivery']).not('customer_address', 'is', null).limit(10);
      let found = 0;
      for (const o of list ?? []) {
        const g = await geocode(sb, withCity(String(o.customer_address).split(' — ')[0].slice(0, 200), st?.address));
        if (!g) continue;
        const km = st?.lat != null ? Number((await sb.rpc('road_km', { _lat1: st.lat, _lng1: st.lng, _lat2: g.lat, _lng2: g.lng })).data) : null;
        await sb.from('orders').update({ delivery_lat: g.lat, delivery_lng: g.lng, delivery_km: km }).eq('id', o.id);
        found++;
        await new Promise(r => setTimeout(r, 1100)); // política do OpenStreetMap: 1 consulta por segundo
      }
      return json({ checked: list?.length ?? 0, found });
    }

    if (action === 'coupon') {
      const slug = String(body?.slug ?? '').toLowerCase();
      const store = SLUG.test(slug) ? await storeBySlug(sb, slug) : null;
      if (!store) return json({ error: 'Loja não encontrada.' }, 404);
      const user = await currentUser(sb, req);
      const { data: profile } = user
        ? await sb.from('customer_profiles').select('phone').eq('user_id', user.id).maybeSingle()
        : { data: null };
      const { data, error } = await sb.rpc('coupon_check', {
        _restaurant_id: store.restaurant_id, _code: String(body?.code ?? '').slice(0, 20),
        _subtotal: Number(body?.subtotal) || 0, _fee: Number(body?.fee) || 0,
        _user_id: user?.id ?? null, _phone: profile?.phone ?? phone55(body?.phone) ?? '',
      });
      if (error) return json({ error: 'Não foi possível conferir o cupom.' }, 400);
      const r = data as any;
      if (!r?.ok) return json({ error: r?.error ?? 'Cupom inválido.' }, 400);
      return json({ code: r.code, label: r.label, discount: Number(r.discount), free_delivery: !!r.free_delivery });
    }

    if (action === 'status') {
      const orderId = String(body?.orderId ?? '');
      const token = String(body?.token ?? '');
      if (!UUID.test(orderId) || !UUID.test(token)) return json({ error: 'Pedido não encontrado.' }, 404);
      const { data: order } = await sb.from('orders')
        .select('id, restaurant_id, order_type, delivery_status, total, delivery_fee, discount, coupon_code, customer_name, customer_address, payment_hint, change_for, created_at, order_items(quantity, unit_price, status, notes, options_text, menu_items(name))')
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
