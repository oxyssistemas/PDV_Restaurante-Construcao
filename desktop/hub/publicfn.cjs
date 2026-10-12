// Funções públicas (sem login da equipe) respondidas pelo próprio servidor da loja, com as mesmas regras da nuvem:
//   kiosk          totem / tablet de autoatendimento (central offline e servidor dedicado)
//   order-review   avaliação pós-pedido (NPS)
//   public-menu    cardápio do QR da mesa
//   delivery-store loja online (servidor dedicado; a nuvem repassa os pedidos dos clientes, assinados)
// No servidor dedicado, a nuvem repassa as chamadas da internet para cá (x-oxys-relay = HMAC do corpo).

const crypto = require('node:crypto');
const { restaurantActive } = require('./trial.cjs');

class PublicError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const promo = require('./promo.cjs');
const geo = require('./geo.cjs');
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
  const active = () => restaurant()?.status === undefined || restaurantActive(restaurant(), (id) => mirror.rows('restaurants').find(r => r.id === id));
  const brand = () => {
    const b = rows('branding_settings')[0];
    return { name: (b?.brand_name || '').trim() || restaurant()?.name || 'Restaurante', logo: mediaUrl('menu-images', b?.logo_light_url || b?.logo_dark_url) };
  };
  /** Grupos de opções do prato (Tamanho, Sabores, Adicionais), no formato das funções públicas da nuvem. */
  const optionGroups = (itemId) => rows('menu_option_groups').filter(g => g.menu_item_id === itemId)
    .sort((a, b) => Number(a.kind !== 'size') - Number(b.kind !== 'size') || (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)))
    .map(g => ({
      id: g.id, name: g.name, kind: g.kind, min_select: g.min_select, max_select: g.max_select, pricing: g.pricing, sort_order: g.sort_order ?? 0, menu_item_id: g.menu_item_id,
      options: rows('menu_options').filter(o => o.group_id === g.id && o.available)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
        .map(o => ({ id: o.id, group_id: g.id, name: o.name, price: Number(o.price), linked_item_id: o.linked_item_id ?? null, available: true, sort_order: o.sort_order ?? 0 })),
    }));
  /** menu_item_on_now: dias e horário de venda do prato (horário de Brasília). */
  const onNow = (i) => {
    const now = mirror.localNow();
    const dow = new Date(`${now.date}T12:00:00Z`).getUTCDay();
    const days = i.available_days ?? [];
    if (days.length && !days.includes(dow)) return false;
    const from = i.available_from?.slice(0, 5), to = i.available_to?.slice(0, 5), t = now.time.slice(0, 5);
    if (!from || !to || from === to) return true;
    return from < to ? t >= from && t < to : t >= from || t < to;
  };
  /** menu_item_quote: preço e descrição das opções escolhidas (mesma regra do banco). */
  const quote = (m, chosen) => {
    const ids = new Set((Array.isArray(chosen) ? chosen : []).map(String));
    const groups = optionGroups(m.id);
    const known = new Set(groups.flatMap(g => g.options.map(o => o.id)));
    if ([...ids].some(id => !known.has(id))) throw new PublicError(`Uma opção escolhida para "${m.name}" não está mais disponível.`);
    let base = Number(m.price), ratio = 1, extras = 0;
    const parts = [];
    for (const g of groups) {
      const sel = g.options.filter(o => ids.has(o.id));
      if (sel.length < g.min_select) throw new PublicError(`"${m.name}": escolha ${g.min_select === 1 ? '1 opção' : `${g.min_select} opções`} em ${g.name}.`);
      if (sel.length > g.max_select) throw new PublicError(`"${m.name}": no máximo ${g.max_select} em ${g.name}.`);
      if (!sel.length) continue;
      if (g.kind === 'size') {
        ratio = Number(m.price) > 0 ? sel[0].price / Number(m.price) : 1;
        base = sel[0].price;
        parts.push(`${g.name} ${sel[0].name}`);
      } else if (g.kind === 'flavor') {
        const prices = sel.map(o => o.price);
        base = round2((g.pricing === 'avg' ? prices.reduce((a, b) => a + b, 0) / prices.length : Math.max(...prices)) * ratio);
        parts.push(sel.map(o => `${sel.length > 1 ? `1/${sel.length} ` : ''}${o.name}`).join(', '));
      } else {
        extras += sel.reduce((a, o) => a + o.price, 0);
        parts.push(`${g.name}: ${sel.map(o => o.name).join(', ')}`);
      }
    }
    return { price: round2(base + extras), label: parts.length ? parts.join(' · ') : null, options: [...ids] };
  };
  const menu = () => ({
    categories: rows('menu_categories').map(c => ({ id: c.id, name: c.name, sort_order: c.sort_order })).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    items: rows('menu_items').filter(i => i.available && onNow(i) && !i.sold_by_weight).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(i => ({
        id: i.id, name: i.name, description: i.description ?? null, price: Number(i.price), image_url: mediaUrl('menu-images', i.image_url), category_id: i.category_id ?? null,
        option_groups: optionGroups(i.id),
      })),
  });
  const menuItem = (id) => rows('menu_items').find(m => m.id === id && m.available && onNow(m) && !m.sold_by_weight);
  const ins = (table, obj) => mirror.insert(table, [obj], SYSTEM)[0];
  const today = () => mirror.localNow().date;
  const dayStart = () => new Date(`${today()}T00:00:00-03:00`).toISOString();

  /** Itens do pedido com o preço do cardápio (nunca o enviado). */
  function addItems(orderId, items, maxQty, rodizioId = null) {
    let total = 0;
    for (const it of items) {
      const qty = Math.trunc(Number(it?.quantity));
      if (!(qty >= 1 && qty <= maxQty)) throw new PublicError(`Cada item deve ter quantidade entre 1 e ${maxQty}.`);
      const m = menuItem(String(it?.menu_item_id ?? ''));
      if (!m) throw new PublicError('Um produto escolhido não está mais disponível.');
      // mesa em rodízio: só os pratos do rodízio, sem cobrar (create_qr_order)
      if (rodizioId && !(m.rodizio_ids || []).includes(rodizioId)) throw new PublicError(`"${m.name}" não faz parte do rodízio. Chame o garçom para pedir por fora.`);
      const q = quote(m, it?.options);
      const price = rodizioId ? 0 : q.price;
      ins('order_items', {
        order_id: orderId, menu_item_id: m.id, quantity: qty, unit_price: price, notes: str(it?.notes, 300) || null, status: 'pending',
        options: q.options, options_text: q.label,
      });
      total += qty * price;
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
      auto_promotions: promo.activePromos(mirror, rid(), 'counter'),
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
      google_review_url: fs?.google_review_url ?? null, google_min_score: fs?.google_min_score ?? 9,
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
      const total = addItems(order.id, items, 20, table.rodizio_id || null);
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
    if (body.action === 'call_waiter' || body.action === 'bill') {
      // botão "Chamar garçom" / "Pedir a conta" do QR e do tablet da mesa (no máximo um a cada 45 s)
      const type = body.action === 'bill' ? 'bill_request' : 'waiter_call';
      const recent = rows('notifications').some(n => n.table_id === table.id && n.type === type && Date.parse(n.created_at) > Date.now() - 45_000);
      if (!recent) {
        const why = str(body.reason, 140);
        mirror.sysInsert('notifications', {
          restaurant_id: rid(), table_id: table.id, type, created_at: new Date().toISOString(),
          title: type === 'bill_request' ? `Mesa ${table.number} pediu a conta` : `Mesa ${table.number} chamou o garçom`,
          message: why || (type === 'bill_request' ? 'O cliente pediu a conta pelo QR da mesa.' : 'O cliente chamou pelo QR da mesa.'),
          target_roles: type === 'bill_request' ? ['waiter', 'cashier', 'admin'] : ['waiter'],
        }, null);
        mirror.state.changed();
      }
      return { ok: true };
    }
    const m = menu();
    const rod = table.rodizio_id ? rows('rodizios').find(r => r.id === table.rodizio_id) : null;
    const rodItems = new Set(rows('menu_items').filter(i => rod && (i.rodizio_ids || []).includes(rod.id)).map(i => i.id));
    return {
      restaurant: brand(), table: { number: table.number },
      rodizio: rod ? { name: rod.name, description: rod.description ?? null } : null,
      auto_promotions: rod ? [] : promo.activePromos(mirror, rid(), 'salon'),
      categories: m.categories,
      items: rod ? m.items.filter(i => rodItems.has(i.id)).map(i => ({ ...i, price: 0, in_rodizio: true })) : m.items,
    };
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
  function onlineOrder(o, user, profile, point = null) {
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
      if (s.fee_mode === 'distance') {
        const r = geo.feeByKm(s, point?.lat, point?.lng);
        if (!r.ok) throw new PublicError(r.error);
        fee = r.fee;
        point = { ...point, km: r.km };
      } else if (zones.length) {
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
      subtotal += q * quote(m, it?.options).price;
    }
    if (subtotal < Number(s.min_order || 0)) throw new PublicError(`O pedido mínimo é de R$ ${Number(s.min_order).toFixed(2).replace('.', ',')}.`);
    // cupom conferido antes de gravar (aqui não há transação para desfazer)
    const coupon = str(o.coupon, 20) ? promo.couponCheck(mirror, rid(), o.coupon, subtotal, user.id, phone) : null;
    if (coupon && !coupon.ok) throw new PublicError(coupon.error);

    const token = crypto.randomUUID();
    const order = ins('orders', {
      restaurant_id: rid(), status: 'pending', total: 0, customer_name: name, customer_phone: phone, customer_address: address,
      delivery_fee: fee, delivery_status: 'pending', order_type: mode === 'pickup' ? 'takeaway' : 'delivery', source: channel,
      notes: str(o.notes, 500) || null, created_by_name: channel === 'whatsapp' ? 'Cliente via WhatsApp' : 'Cliente via loja online',
      created_by_role: 'customer', public_token: token, payment_hint: payment, change_for: changeFor, customer_user_id: user.id,
      ...(point && mode === 'delivery' ? { delivery_lat: point.lat, delivery_lng: point.lng, delivery_km: point.km ?? null } : {}),
    });
    const total = addItems(order.id, items, 50);
    const byOrder = { filters: { '': [{ col: 'id', op: 'eq', value: order.id, path: [] }] }, order: {}, limit: {}, offset: {} };
    mirror.update('orders', { total }, byOrder, SYSTEM);
    // cupom de desconto (coupon_check)
    let feeToPay = fee;
    if (coupon) {
      const c = coupon;
      if (c.free_delivery) feeToPay = 0;
      mirror.update('orders', { coupon_code: c.code, coupon_discount: c.discount, delivery_fee: feeToPay }, byOrder, SYSTEM);
      ins('coupon_redemptions', { restaurant_id: rid(), promotion_id: c.id, order_id: order.id, customer_user_id: user.id, customer_phone: phone, discount: c.discount });
      promo.refreshDiscount(mirror, order.id, null);
    }
    linkCustomer(user, { name, phone, address: mode === 'delivery' ? str(o.address_line, 200) || null : profile?.address ?? null, complement: mode === 'delivery' ? str(o.complement, 90) || null : profile?.complement ?? null });
    // cashback do cliente abate do total
    const cb = o.use_cashback ? cashbackOf(phone) : null;
    if (cb && cb.balance >= 0.01) {
      const discount = Number(rows('orders').find(x => x.id === order.id)?.discount || 0);
      const amount = round2(Math.min(cb.balance, total + feeToPay - discount));
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
          min_order: Number(s.min_order), default_fee: Number(s.default_fee),
          zones: s.fee_mode === 'distance' ? [] : (s.zones ?? []).map(z => ({ name: String(z.name), fee: Number(z.fee) })),
          fee_mode: s.fee_mode ?? 'zones', max_km: s.max_km == null ? null : Number(s.max_km),
          eta_minutes: s.eta_minutes, pickup_eta_minutes: s.pickup_eta_minutes, payment_methods: s.payment_methods, whatsapp: s.whatsapp,
          address: s.address, hours_text: s.hours_text, notice: s.notice,
          hero: { title: s.hero_title || null, highlight: s.hero_highlight || null, subtitle: s.hero_subtitle || null, image: mediaUrl('store-media', s.hero_image) },
          featured_item_ids: (s.featured_item_ids ?? []).filter(id => available.has(id)),
        },
        promotions: rows('delivery_promotions').filter(p => p.active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(p => ({ id: p.id, title: p.title, subtitle: p.subtitle, image: mediaUrl('store-media', p.image), menu_item_id: p.menu_item_id && available.has(p.menu_item_id) ? p.menu_item_id : null })),
        ...menu(),
        auto_promotions: promo.activePromos(mirror, rid(), 'delivery'),
      };
    }
    if (action === 'geocode_store') {
      // só usa o endereço da própria loja (sem dado de cliente)
      if (!s.address) throw new PublicError('Preencha o endereço da loja.');
      return geo.geocode(s.address).then(g => {
        if (!g) throw new PublicError('Não encontramos o endereço da loja no mapa. Escreva rua, número, bairro e cidade.');
        mirror.update('delivery_stores', { lat: g.lat, lng: g.lng }, { filters: { '': [{ col: 'restaurant_id', op: 'eq', value: rid(), path: [] }] }, order: {}, limit: {}, offset: {} }, SYSTEM);
        return { lat: g.lat, lng: g.lng, label: g.label };
      });
    }
    if (action === 'geocode_orders') {
      const list = rows('orders').filter(o => o.order_type === 'delivery' && !o.archived_at && o.delivery_lat == null && o.customer_address
        && ['pending', 'preparing', 'out_for_delivery'].includes(o.delivery_status)).slice(0, 10);
      return (async () => {
        let found = 0;
        for (const o of list) {
          const g = await geo.geocode(geo.withCity(String(o.customer_address).split(' — ')[0].slice(0, 200), s.address));
          if (!g) continue;
          const km = s.lat != null ? geo.roadKm({ lat: s.lat, lng: s.lng }, g) : null;
          mirror.update('orders', { delivery_lat: g.lat, delivery_lng: g.lng, delivery_km: km }, { filters: { '': [{ col: 'id', op: 'eq', value: o.id, path: [] }] }, order: {}, limit: {}, offset: {} }, SYSTEM);
          found++;
          await new Promise(r => setTimeout(r, 1100));
        }
        return { checked: list.length, found };
      })();
    }
    if (action === 'quote') {
      if (s.fee_mode !== 'distance') return { mode: 'zones' };
      return geo.geocode(geo.withCity(str(body.address, 200), s.address)).then(g => {
        if (!g) throw new PublicError('Não encontramos esse endereço no mapa. Confira rua, número, bairro e cidade.');
        const r = geo.feeByKm(s, g.lat, g.lng);
        if (!r.ok) throw new PublicError(r.error);
        return { mode: 'distance', km: r.km, fee: r.fee, lat: g.lat, lng: g.lng, label: g.label };
      });
    }
    if (action === 'coupon') {
      const user = relay?.user?.id ? relay.user : null;
      const r = promo.couponCheck(mirror, rid(), str(body.code, 20), Number(body.subtotal) || 0, user?.id ?? null,
        mirror.constructor.normPhone(relay?.profile?.phone ?? body.phone));
      if (!r.ok) throw new PublicError(r.error);
      return { code: r.code, label: r.label, discount: r.discount, free_delivery: r.free_delivery };
    }
    if (action === 'status') {
      const order = rows('orders').find(o => o.id === body.orderId && o.public_token === body.token);
      if (!order) throw new PublicError('Pedido não encontrado.', 404);
      return {
        order: {
          id: order.id, code: order.id.slice(0, 8).toUpperCase(), order_type: order.order_type, delivery_status: order.delivery_status,
          total: Number(order.total), delivery_fee: Number(order.delivery_fee || 0), discount: Number(order.discount || 0), coupon_code: order.coupon_code ?? null,
          customer_name: order.customer_name, customer_address: order.customer_address,
          payment_hint: order.payment_hint, change_for: order.change_for, created_at: order.created_at,
          order_items: mirror.rows('order_items').filter(i => i.order_id === order.id).map(i => ({
            quantity: i.quantity, unit_price: Number(i.unit_price), status: i.status, notes: i.notes ?? null, options_text: i.options_text ?? null,
            menu_items: { name: mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item' },
          })),
        },
        store: { slug: s.slug, whatsapp: s.whatsapp, eta_minutes: s.eta_minutes, pickup_eta_minutes: s.pickup_eta_minutes },
        review_ref: rid(), // o link da avaliação leva a loja (a nuvem repassa para cá)
      };
    }
    // daqui para baixo, só com o cliente confirmado pela nuvem (repasse assinado)
    if (!relay?.user?.id) throw new PublicError('Entre na sua conta.', 401);
    if (action === 'order') {
      const o = body.order ?? {};
      // taxa por km: acha o endereço no mapa antes de gravar
      if (s.fee_mode === 'distance' && o.mode !== 'pickup') {
        return geo.geocode(geo.withCity(str(o.address_line ?? o.address, 200), s.address)).then(g => {
          if (!g) throw new PublicError('Não encontramos esse endereço no mapa. Confira rua, número, bairro e cidade.');
          return onlineOrder(o, relay.user, relay.profile, g);
        });
      }
      return onlineOrder(o, relay.user, relay.profile, null);
    }
    if (action === 'link') { linkCustomer(relay.user, relay.profile); return { ok: true }; }
    if (action === 'me') {
      if (relay.profile) linkCustomer(relay.user, relay.profile);
      const orders = rows('orders').filter(o => o.customer_user_id === relay.user.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20)
        .map(o => ({
          id: o.id, code: o.id.slice(0, 8).toUpperCase(), created_at: o.created_at, delivery_status: o.delivery_status, order_type: o.order_type,
          total: Number(o.total), delivery_fee: Number(o.delivery_fee || 0), discount: Number(o.discount || 0), public_token: o.public_token,
          order_items: mirror.rows('order_items').filter(i => i.order_id === o.id)
            .map(i => ({ quantity: i.quantity, status: i.status, menu_items: { name: mirror.rows('menu_items').find(m => m.id === i.menu_item_id)?.name ?? 'Item' } })),
        }));
      return { orders, cashback: relay.profile?.phone ? cashbackOf(relay.profile.phone) : null };
    }
    throw new PublicError('Ação inválida.');
  }

  // ---------- reserva online e fila de espera (servidor dedicado) ----------
  const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
  const toTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function booking(body) {
    if (body.action === 'queue_status' || body.action === 'queue_leave') {
      const w = rows('waitlist').find(x => x.public_token === body.token);
      if (!w) throw new PublicError('Fila não encontrada.', 404);
      const byId = { filters: { '': [{ col: 'id', op: 'eq', value: w.id, path: [] }] }, order: {}, limit: {}, offset: {} };
      if (body.action === 'queue_leave' && ['waiting', 'called'].includes(w.status)) { mirror.update('waitlist', { status: 'cancelled' }, byId, SYSTEM); return { ok: true }; }
      const ahead = rows('waitlist').filter(x => x.status === 'waiting' && String(x.created_at) < String(w.created_at)).length;
      return { name: w.name, party: w.party_size, status: w.status, position: w.status === 'waiting' ? ahead + 1 : null, restaurant: brand().name, called_at: w.called_at ?? null };
    }
    const s = rows('booking_settings')[0];
    if (!s || s.slug !== String(body.slug ?? '').toLowerCase() || !(s.online_enabled || s.waitlist_online) || !active()) throw new PublicError('Página não encontrada.', 404);
    const now = mirror.localNow();
    const nowMin = toMin(now.time);
    if (body.action === 'info') {
      return { name: brand().name, online_enabled: s.online_enabled, waitlist_online: s.waitlist_online, hours: s.hours ?? {}, min_party: s.min_party,
        max_party: s.max_party, advance_days: s.advance_days, notice: s.notice ?? null, duration_minutes: s.duration_minutes, today: now.date };
    }
    const date = String(body.date ?? '');
    const party = Math.trunc(Number(body.party));
    const overlaps = (t, start, end) => rows('reservations').some(r => r.table_id === t.id && r.status === 'confirmed' && r.reservation_date === date
      && toMin(r.start_time) < end && toMin(r.end_time) > start);
    if (body.action === 'slots') {
      if (!s.online_enabled || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(party >= 1)) throw new PublicError('Escolha a data e o número de pessoas.');
      const h = (s.hours ?? {})[String(new Date(`${date}T12:00:00Z`).getUTCDay())];
      if (!h) return { slots: [] };
      const tables = rows('restaurant_tables').filter(t => t.capacity >= party);
      const slots = [];
      for (let m = toMin(h[0]); m <= toMin(h[1]); m += s.slot_minutes) {
        if (date === now.date && m < nowMin + s.min_notice_minutes) continue;
        if (tables.some(t => !overlaps(t, m, m + s.duration_minutes))) slots.push(toTime(m));
      }
      return { slots };
    }
    if (body.action === 'book') {
      // book_online
      if (!s.online_enabled) throw new PublicError('A reserva online não está ativa nesta loja.');
      const time = String(body.time ?? '');
      const name = str(body.name, 80), phone = String(body.phone ?? '').slice(0, 20);
      if (name.length < 2) throw new PublicError('Informe seu nome.');
      if (phone.replace(/\D/g, '').length < 10) throw new PublicError('Informe um WhatsApp com DDD.');
      if (party < s.min_party || party > s.max_party) throw new PublicError(`Reservas online de ${s.min_party} a ${s.max_party} pessoas. Para grupos maiores, fale com a loja.`);
      const start = toMin(time);
      if (date < now.date || (date === now.date && start < nowMin + s.min_notice_minutes)) throw new PublicError('Escolha um horário com mais antecedência.');
      const h = (s.hours ?? {})[String(new Date(`${date}T12:00:00Z`).getUTCDay())];
      if (!h || start < toMin(h[0]) || start > toMin(h[1])) throw new PublicError('A loja não recebe reservas nesse horário.');
      const end = start + s.duration_minutes;
      const table = rows('restaurant_tables').filter(t => t.capacity >= party).sort((a, b) => a.capacity - b.capacity || a.number - b.number)
        .find(t => !overlaps(t, start, end));
      if (!table) throw new PublicError(`Não há mesa livre para ${party} pessoa(s) nesse horário. Tente outro horário.`);
      const r = ins('reservations', { restaurant_id: rid(), table_id: table.id, customer_name: name, customer_phone: phone, reservation_date: date,
        start_time: `${time}:00`, end_time: `${toTime(end)}:00`, party_size: party, status: 'confirmed', notes: str(body.notes, 300) || null, source: 'online' });
      mirror.sysInsert('notifications', { restaurant_id: rid(), title: 'Nova reserva online', type: 'reservation', target_roles: ['admin', 'waiter'],
        message: `${name} · ${party} pessoa(s) · ${date.slice(8, 10)}/${date.slice(5, 7)} às ${time}`, created_at: new Date().toISOString() }, null);
      return { id: r.id, table: table.number, end: toTime(end) };
    }
    if (body.action === 'queue_join') {
      if (!s.waitlist_online) throw new PublicError('A fila online está desligada.');
      const name = str(body.name, 80), phone = String(body.phone ?? '').replace(/\D/g, '').slice(0, 13);
      if (name.length < 2) throw new PublicError('Informe seu nome.');
      if (phone.length < 10) throw new PublicError('Informe um WhatsApp com DDD.');
      if (!(party >= 1 && party <= 50)) throw new PublicError('Informe quantas pessoas.');
      if (rows('waitlist').some(x => x.phone === phone && ['waiting', 'called'].includes(x.status))) throw new PublicError('Este telefone já está na fila.');
      const w = ins('waitlist', { restaurant_id: rid(), name, phone, party_size: party, source: 'online' });
      return { token: w.public_token };
    }
    throw new PublicError('Ação inválida.');
  }

  const HANDLERS = { kiosk, 'order-review': review, 'public-menu': tableMenu, 'delivery-store': onlineStore, 'public-booking': booking };
  // função do plano da loja que cada tela pública precisa (mesma regra da nuvem)
  const PLAN = {
    kiosk: ['kiosk', 'O autoatendimento não está ativo nesta loja.'],
    'order-review': ['reviews', 'A avaliação não está ativa nesta loja.'],
    'public-menu': ['qr_menu', 'O cardápio pelo QR Code não está ativo nesta loja. Chame o garçom.'],
    'delivery-store': ['online_store', 'Loja não encontrada.'],
    'public-booking': ['reservations', 'Página não encontrada.'],
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
    if (name !== 'delivery-store' && name !== 'public-booking' && !UUID.test(String(body.token ?? ''))) throw new PublicError(name === 'kiosk' ? 'Totem não encontrado.' : 'Não encontrado.', 404);
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
