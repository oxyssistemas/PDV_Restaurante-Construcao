// Funções públicas (sem login da equipe) respondidas pelo próprio servidor da loja, com as mesmas regras da nuvem:
//   kiosk          totem / tablet de autoatendimento (central offline e servidor dedicado)
//   order-review   avaliação pós-pedido (NPS)
//   public-menu    cardápio do QR da mesa
//   delivery-store loja online (servidor dedicado; a nuvem repassa os pedidos dos clientes, assinados)
// No servidor dedicado, a nuvem repassa as chamadas da internet para cá (x-oxys-relay = HMAC do corpo).

const crypto = require('node:crypto');

class PublicError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const SYSTEM = { who: null, authz: null, txid: null };

/** Assinatura do repasse da nuvem (segredo combinado no controle do servidor dedicado). */
function verifyRelay(secret, raw, header) {
  if (!secret || !header) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(header).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * publicBase(): endereço deste servidor pela internet (fotos nas respostas repassadas pela nuvem)
 * cloudReviewUrl(order): link da avaliação impresso no recibo
 */
function createPublicFunctions({ mirror, publicBase = () => null, cloudReviewUrl = null, getRelaySecret = () => null, dedicated = false }) {
  let base = '';
  const mediaUrl = (bucket, p) => (!p ? null : /^https?:\/\//.test(p) ? p : `${base}/media/${bucket}/${String(p).split('/').map(encodeURIComponent).join('/')}`);
  const rid = () => mirror.restaurantId;
  const rows = (t) => mirror.rows(t).filter(r => !('restaurant_id' in r) || r.restaurant_id === rid());
  const restaurant = () => mirror.rows('restaurants').find(r => r.id === rid());
  const active = () => restaurant()?.status === 'active' || restaurant()?.status === undefined;
  const brand = () => {
    const b = rows('branding_settings')[0];
    return { name: (b?.brand_name || '').trim() || restaurant()?.name || 'Restaurante', logo: mediaUrl('menu-images', b?.logo_light_url || b?.logo_dark_url) };
  };
  const menu = () => ({
    categories: rows('menu_categories').map(c => ({ id: c.id, name: c.name, sort_order: c.sort_order })).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    items: rows('menu_items').filter(i => i.available).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(i => ({ id: i.id, name: i.name, description: i.description ?? null, price: Number(i.price), image_url: mediaUrl('menu-images', i.image_url), category_id: i.category_id ?? null })),
  });
  const menuItem = (id) => rows('menu_items').find(m => m.id === id && m.available);
  const ins = (table, obj) => mirror.insert(table, [obj], SYSTEM)[0];
  const today = () => mirror.localNow().date;
  const dayStart = () => new Date(`${today()}T00:00:00-03:00`).toISOString();

  /** Itens do pedido com o preço do cardápio (nunca o enviado). */
  function addItems(orderId, items, maxQty) {
    let total = 0;
    for (const it of items) {
      const qty = Math.trunc(Number(it?.quantity));
      if (!(qty >= 1 && qty <= maxQty)) throw new PublicError(`Cada item deve ter quantidade entre 1 e ${maxQty}.`);
      const m = menuItem(String(it?.menu_item_id ?? ''));
      if (!m) throw new PublicError('Um produto escolhido não está mais disponível.');
      ins('order_items', { order_id: orderId, menu_item_id: m.id, quantity: qty, unit_price: Number(m.price), notes: str(it?.notes, 300) || null, status: 'pending' });
      total += qty * Number(m.price);
    }
    return round2(total);
  }

  // ---------- totem ----------
  function kiosk(body) {
    const k = rows('kiosks').find(x => x.token === body.token && x.enabled);
    if (!k || !active()) throw new PublicError('Este totem está desativado no momento.', 404);
    if (body.action === 'order') {
      const o = body.order ?? {};
      const name = str(o.name, 40);
      if (name.length < 2) throw new PublicError('Digite seu nome para chamarmos você.');
      const mode = o.mode === 'eat_in' ? 'eat_in' : 'takeaway';
      if ((mode === 'eat_in' && !k.eat_in_enabled) || (mode === 'takeaway' && !k.takeaway_enabled)) throw new PublicError('Escolha se vai comer aqui ou levar.');
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length < 1 || items.length > 40) throw new PublicError('O pedido deve ter entre 1 e 40 itens.');
      const recent = rows('orders').filter(x => x.source === 'kiosk' && x.created_by_name === `Totem: ${k.name}` && Date.parse(x.created_at) > Date.now() - 60_000);
      if (recent.length >= 6) throw new PublicError('Muitos pedidos em pouco tempo. Aguarde um instante.');
      const since = dayStart();
      const ticket = rows('orders').filter(x => x.ticket_number != null && x.created_at >= since).reduce((m, x) => Math.max(m, Number(x.ticket_number)), 0) + 1;
      const phone = mirror.constructor.normPhone(o.phone);
      const order = ins('orders', {
        restaurant_id: rid(), status: 'pending', total: 0, customer_name: name, customer_phone: phone, created_by_name: `Totem: ${k.name}`,
        created_by_role: 'customer', order_type: 'takeaway', source: 'kiosk', delivery_status: 'pending', payment_hint: 'counter',
        notes: mode === 'eat_in' ? 'Comer no local' : 'Para levar', ticket_number: ticket,
      });
      const total = addItems(order.id, items, 20);
      mirror.update('orders', { total }, { filters: { '': [{ col: 'id', op: 'eq', value: order.id, path: [] }] }, order: {}, limit: {}, offset: {} }, SYSTEM);
      return { orderId: order.id, ticket, total };
    }
    return {
      restaurant: brand(),
      kiosk: { name: k.name, eat_in: k.eat_in_enabled, takeaway: k.takeaway_enabled, ask_phone: k.ask_phone, welcome: k.welcome_text ?? null, idle_seconds: k.idle_seconds },
      featured: (rows('delivery_stores')[0]?.featured_item_ids ?? []).filter(id => menuItem(id)),
      ...menu(),
    };
  }

  // ---------- avaliação (NPS) ----------
  function review(body) {
    const order = rows('orders').find(o => o.public_token === body.token && o.status !== 'cancelled');
    if (!order) throw new PublicError('Pedido não encontrado.', 404);
    const fs = rows('feedback_settings')[0];
    const enabled = fs?.enabled !== false;
    const existing = rows('order_reviews').find(r => r.order_id === order.id);
    if (body.action === 'submit') {
      if (!enabled) throw new PublicError('Esta loja não está recebendo avaliações.');
      const score = Math.trunc(Number(body.score));
      if (!(score >= 0 && score <= 10)) throw new PublicError('Escolha uma nota de 0 a 10.');
      if (Date.parse(order.created_at) < Date.now() - 30 * 86400e3) throw new PublicError('O prazo para avaliar este pedido terminou.');
      if (existing) throw new PublicError('Este pedido já foi avaliado. Obrigado!');
      const star = (v) => { const n = Math.trunc(Number(v)); return n >= 1 && n <= 5 ? n : null; };
      const comment = str(body.comment, 1000) || null;
      mirror.sysInsert('order_reviews', {
        restaurant_id: rid(), order_id: order.id, score, food_score: star(body.food), service_score: star(body.service), speed_score: star(body.speed),
        comment, customer_name: order.customer_name ?? null, customer_phone: mirror.constructor.normPhone(order.customer_phone), order_type: order.order_type,
        created_at: new Date().toISOString(),
      }, null);
      if (score <= Number(fs?.alert_score ?? 6)) {
        mirror.sysInsert('notifications', {
          restaurant_id: rid(), title: 'Avaliação baixa recebida', type: 'review', target_roles: ['admin'], created_at: new Date().toISOString(),
          message: `Nota ${score} no pedido #${order.id.slice(0, 8).toUpperCase()}${order.customer_name ? ` de ${order.customer_name}` : ''}${comment ? `: "${comment.slice(0, 140)}"` : ''}`,
        }, null);
      }
      mirror.state.changed();
      return { ok: true };
    }
    const b = brand();
    return {
      order_id: order.id, code: order.id.slice(0, 8).toUpperCase(), created_at: order.created_at, order_type: order.order_type,
      customer_name: order.customer_name ?? null, restaurant: b.name, logo: b.logo, enabled, thank_you: fs?.thank_you ?? null,
      review: existing ? { score: existing.score, comment: existing.comment, reply: existing.reply, created_at: existing.created_at } : null,
      items: mirror.rows('order_items').filter(i => i.order_id === order.id && i.status !== 'cancelled')
        .map(i => ({ name: menuItem(i.menu_item_id)?.name ?? mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item', quantity: i.quantity })),
    };
  }

  // ---------- cardápio do QR da mesa ----------
  function tableMenu(body) {
    const table = rows('restaurant_tables').find(t => t.qr_token === body.token);
    if (!table || !table.qr_enabled || !active()) throw new PublicError('Este QR Code não está disponível no momento.', 404);
    if (body.action === 'order') {
      const name = str(body.customerName, 80);
      if (name.length < 2) throw new PublicError('Informe um nome entre 2 e 80 caracteres.');
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length < 1 || items.length > 30) throw new PublicError('O pedido deve conter entre 1 e 30 itens.');
      const recent = rows('orders').filter(o => o.table_id === table.id && o.source === 'qr' && Date.parse(o.created_at) > Date.now() - 120_000);
      if (recent.length >= 5) throw new PublicError('Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos.');
      const order = ins('orders', {
        restaurant_id: rid(), table_id: table.id, status: 'pending', total: 0, customer_name: name,
        created_by_name: 'Cliente via QR', created_by_role: 'customer', order_type: 'dine_in', source: 'qr',
      });
      const total = addItems(order.id, items, 20);
      const byId = { filters: { '': [{ col: 'id', op: 'eq', value: order.id, path: [] }] }, order: {}, limit: {}, offset: {} };
      mirror.update('orders', { total }, byId, SYSTEM);
      mirror.update('restaurant_tables', { status: 'occupied' }, { ...byId, filters: { '': [{ col: 'id', op: 'eq', value: table.id, path: [] }] } }, SYSTEM);
      return { orderId: order.id };
    }
    if (body.action === 'status') {
      const since = Date.now() - 6 * 3600e3;
      return {
        orders: rows('orders').filter(o => o.table_id === table.id && o.source === 'qr' && !o.archived_at && Date.parse(o.created_at) > since)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10)
          .map(o => ({
            id: o.id, status: o.status, total: Number(o.total), customer_name: o.customer_name, created_at: o.created_at,
            order_items: mirror.rows('order_items').filter(i => i.order_id === o.id)
              .map(i => ({ quantity: i.quantity, status: i.status, menu_items: { name: mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item' } })),
          })),
      };
    }
    return { restaurant: brand(), table: { number: table.number }, ...menu() };
  }

  // ---------- loja online (servidor dedicado) ----------
  const store = () => {
    const s = rows('delivery_stores')[0];
    if (!s || !s.enabled || !active()) throw new PublicError('Loja não encontrada.', 404);
    return s;
  };
  const cashbackOf = (phone) => {
    const p = rows('loyalty_programs')[0];
    if (!p?.enabled || p.mode !== 'cashback' || !mirror.hasFeature('loyalty')) return null;
    const acc = mirror.loyaltyAccount(mirror.constructor.normPhone(phone));
    return { balance: round2(acc?.cashback_balance ?? 0), percent: Number(p.cashback_percent) };
  };

  /** create_online_order + link_store_customer (+ cashback), igual à nuvem. */
  function onlineOrder(o, user, profile) {
    const s = store();
    if (!user?.id) throw new PublicError('Entre na sua conta para fazer o pedido.', 401);
    if (!s.is_open) throw new PublicError('A loja está fechada no momento.');
    const name = str(o.name, 80);
    let phone = String(o.phone ?? '').replace(/\D/g, '');
    const mode = o.mode === 'pickup' ? 'pickup' : o.mode === 'delivery' ? 'delivery' : '';
    const channel = o.channel === 'whatsapp' ? 'whatsapp' : 'site';
    if (name.length < 2) throw new PublicError('Informe seu nome.');
    if (phone.length < 10 || phone.length > 13) throw new PublicError('Informe um telefone com DDD.');
    if (phone.length <= 11) phone = `55${phone}`;
    const payment = String(o.payment ?? '');
    if (!(s.payment_methods || []).includes(payment)) throw new PublicError('Escolha a forma de pagamento.');
    const changeFor = payment === 'cash' && o.change_for ? Number(String(o.change_for).replace(',', '.')) || null : null;
    let fee = 0, address = str(o.address, 300) || null;
    if (mode === 'delivery') {
      if (!s.delivery_enabled) throw new PublicError('A loja não está fazendo entregas agora.');
      if (!address || address.length < 5) throw new PublicError('Informe o endereço de entrega.');
      const zones = Array.isArray(s.zones) ? s.zones : [];
      if (zones.length) {
        const z = zones.find(x => x.name === str(o.zone, 80));
        if (!z) throw new PublicError('Não entregamos nesse bairro.');
        fee = Number(z.fee); address = `${address} — ${z.name}`;
      } else fee = Number(s.default_fee || 0);
    } else if (mode === 'pickup') {
      if (!s.pickup_enabled) throw new PublicError('A loja não está aceitando retirada agora.');
      address = null;
    } else throw new PublicError('Escolha entrega ou retirada.');
    const items = Array.isArray(o.items) ? o.items : [];
    if (items.length < 1 || items.length > 40) throw new PublicError('O pedido deve ter entre 1 e 40 itens.');
    const recent = rows('orders').filter(x => (x.customer_user_id === user.id || x.customer_phone === phone) && Date.parse(x.created_at) > Date.now() - 600_000);
    if (recent.length >= 4) throw new PublicError('Muitos pedidos em pouco tempo. Aguarde alguns minutos.');
    // confere itens e pedido mínimo antes de gravar
    let subtotal = 0;
    for (const it of items) {
      const m = menuItem(String(it?.menu_item_id ?? ''));
      const q = Math.trunc(Number(it?.quantity));
      if (!m) throw new PublicError('Um produto escolhido não está mais disponível.');
      if (!(q >= 1 && q <= 50)) throw new PublicError('Cada item deve ter quantidade entre 1 e 50.');
      subtotal += q * Number(m.price);
    }
    if (subtotal < Number(s.min_order || 0)) throw new PublicError(`O pedido mínimo é de R$ ${Number(s.min_order).toFixed(2).replace('.', ',')}.`);

    const token = crypto.randomUUID();
    const order = ins('orders', {
      restaurant_id: rid(), status: 'pending', total: 0, customer_name: name, customer_phone: phone, customer_address: address,
      delivery_fee: fee, delivery_status: 'pending', order_type: mode === 'pickup' ? 'takeaway' : 'delivery', source: channel,
      notes: str(o.notes, 500) || null, created_by_name: channel === 'whatsapp' ? 'Cliente via WhatsApp' : 'Cliente via loja online',
      created_by_role: 'customer', public_token: token, payment_hint: payment, change_for: changeFor, customer_user_id: user.id,
    });
    const total = addItems(order.id, items, 50);
    mirror.update('orders', { total }, { filters: { '': [{ col: 'id', op: 'eq', value: order.id, path: [] }] }, order: {}, limit: {}, offset: {} }, SYSTEM);
    linkCustomer(user, { name, phone, address: mode === 'delivery' ? str(o.address_line, 200) || null : profile?.address ?? null, complement: mode === 'delivery' ? str(o.complement, 90) || null : profile?.complement ?? null });
    // cashback do cliente abate do total
    const cb = o.use_cashback ? cashbackOf(phone) : null;
    if (cb && cb.balance >= 0.01) {
      const amount = round2(Math.min(cb.balance, total + fee));
      mirror.insert('payments', [{ order_id: order.id, restaurant_id: rid(), method: 'cashback', amount, user_id: user.id, change_amount: 0 }], SYSTEM);
    }
    return { orderId: order.id, token };
  }

  /** Ficha do cliente no CRM da loja (link_store_customer). */
  function linkCustomer(user, p) {
    if (!p?.name || !p?.phone) return null;
    const list = rows('customers');
    let c = list.find(x => x.user_id === user.id)
      || list.find(x => !x.user_id && String(x.phone ?? '').replace(/\D/g, '').slice(-8) === String(p.phone).slice(-8));
    const address = [p.address, p.complement].filter(Boolean).join(' · ') || null;
    if (!c) {
      c = mirror.sysInsert('customers', { restaurant_id: rid(), user_id: user.id, name: p.name, phone: p.phone, email: user.email ?? null, address, tags: ['loja online'] }, null);
    } else {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      mirror.sysUpdate('customers', c, { user_id: user.id, name: p.name, phone: p.phone, email: user.email ?? c.email, address: address ?? c.address, tags: tags.includes('loja online') ? tags : [...tags, 'loja online'] }, null);
    }
    return c.id;
  }

  function onlineStore(body, relay) {
    const s = store();
    const action = String(body.action ?? 'store');
    if (action === 'store') {
      const b = brand();
      const available = new Set(menu().items.map(i => i.id));
      return {
        store: {
          slug: s.slug, name: b.name, logo: b.logo, is_open: s.is_open, delivery_enabled: s.delivery_enabled, pickup_enabled: s.pickup_enabled,
          min_order: Number(s.min_order), default_fee: Number(s.default_fee), zones: (s.zones ?? []).map(z => ({ name: String(z.name), fee: Number(z.fee) })),
          eta_minutes: s.eta_minutes, pickup_eta_minutes: s.pickup_eta_minutes, payment_methods: s.payment_methods, whatsapp: s.whatsapp,
          address: s.address, hours_text: s.hours_text, notice: s.notice,
          hero: { title: s.hero_title || null, highlight: s.hero_highlight || null, subtitle: s.hero_subtitle || null, image: mediaUrl('store-media', s.hero_image) },
          featured_item_ids: (s.featured_item_ids ?? []).filter(id => available.has(id)),
        },
        promotions: rows('delivery_promotions').filter(p => p.active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(p => ({ id: p.id, title: p.title, subtitle: p.subtitle, image: mediaUrl('store-media', p.image), menu_item_id: p.menu_item_id && available.has(p.menu_item_id) ? p.menu_item_id : null })),
        ...menu(),
      };
    }
    if (action === 'status') {
      const order = rows('orders').find(o => o.id === body.orderId && o.public_token === body.token);
      if (!order) throw new PublicError('Pedido não encontrado.', 404);
      return {
        order: {
          id: order.id, code: order.id.slice(0, 8).toUpperCase(), order_type: order.order_type, delivery_status: order.delivery_status,
          total: Number(order.total), delivery_fee: Number(order.delivery_fee || 0), customer_name: order.customer_name, customer_address: order.customer_address,
          payment_hint: order.payment_hint, change_for: order.change_for, created_at: order.created_at,
          order_items: mirror.rows('order_items').filter(i => i.order_id === order.id).map(i => ({
            quantity: i.quantity, unit_price: Number(i.unit_price), status: i.status, notes: i.notes ?? null,
            menu_items: { name: mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item' },
          })),
        },
        store: { slug: s.slug, whatsapp: s.whatsapp, eta_minutes: s.eta_minutes, pickup_eta_minutes: s.pickup_eta_minutes },
        review_ref: rid(), // o link da avaliação leva a loja (a nuvem repassa para cá)
      };
    }
    // daqui para baixo, só com o cliente confirmado pela nuvem (repasse assinado)
    if (!relay?.user?.id) throw new PublicError('Entre na sua conta.', 401);
    if (action === 'order') return onlineOrder(body.order ?? {}, relay.user, relay.profile);
    if (action === 'link') { linkCustomer(relay.user, relay.profile); return { ok: true }; }
    if (action === 'me') {
      if (relay.profile) linkCustomer(relay.user, relay.profile);
      const orders = rows('orders').filter(o => o.customer_user_id === relay.user.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20)
        .map(o => ({
          id: o.id, code: o.id.slice(0, 8).toUpperCase(), created_at: o.created_at, delivery_status: o.delivery_status, order_type: o.order_type,
          total: Number(o.total), delivery_fee: Number(o.delivery_fee || 0), public_token: o.public_token,
          order_items: mirror.rows('order_items').filter(i => i.order_id === o.id)
            .map(i => ({ quantity: i.quantity, status: i.status, menu_items: { name: mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item' } })),
        }));
      return { orders, cashback: relay.profile?.phone ? cashbackOf(relay.profile.phone) : null };
    }
    throw new PublicError('Ação inválida.');
  }

  const HANDLERS = { kiosk, 'order-review': review, 'public-menu': tableMenu, 'delivery-store': onlineStore };
  // função do plano da loja que cada tela pública precisa (mesma regra da nuvem)
  const PLAN = {
    kiosk: ['kiosk', 'O autoatendimento não está ativo nesta loja.'],
    'order-review': ['reviews', 'A avaliação não está ativa nesta loja.'],
    'public-menu': ['qr_menu', 'O cardápio pelo QR Code não está ativo nesta loja. Chame o garçom.'],
    'delivery-store': ['online_store', 'Loja não encontrada.'],
  };

  /** name: função; raw: corpo como veio; headers: cabeçalhos do pedido. */
  function handle(name, raw, headers) {
    const fn = HANDLERS[name];
    if (!fn) return null;
    // na central offline só o totem e o QR da mesa (avaliação e loja online ficam na nuvem)
    if (!dedicated && !['kiosk', 'public-menu'].includes(name)) return null;
    if (!mirror.ready) throw new PublicError('O servidor ainda está carregando os dados da loja.', 503);
    if (!mirror.hasFeature(PLAN[name][0])) throw new PublicError(PLAN[name][1], name === 'delivery-store' ? 404 : 403);
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { throw new PublicError('JSON inválido'); }
    // repasse da nuvem: cliente da loja online já confirmado lá
    let relay = null;
    if (headers['x-oxys-relay']) {
      if (!verifyRelay(getRelaySecret(), raw, headers['x-oxys-relay']) || Math.abs(Date.now() - Number(body.relay_at || 0)) > 300_000) {
        throw new PublicError('Repasse inválido.', 401);
      }
      relay = { user: body.relay_user ?? null, profile: body.relay_profile ?? null };
    }
    base = relay ? (publicBase() || '') : '';
    if (name !== 'delivery-store' && !UUID.test(String(body.token ?? ''))) throw new PublicError(name === 'kiosk' ? 'Totem não encontrado.' : 'Não encontrado.', 404);
    return fn(body, relay);
  }

  /** Link da avaliação impresso no recibo. */
  function reviewUrl(order) {
    const fs = rows('feedback_settings')[0];
    if (!order?.public_token || fs?.enabled === false || fs?.print_on_receipt === false || !cloudReviewUrl) return null;
    if (!mirror.hasFeature('reviews')) return null;
    return cloudReviewUrl(order);
  }

  return { handle, reviewUrl, PublicError };
}

module.exports = { createPublicFunctions, PublicError, verifyRelay };
