import { createClient } from 'npm:@supabase/supabase-js@2';

// Filiais (plano Enterprise). Só o dono (admin da matriz) usa.
//   { action: 'list', parentId }                                         → matriz e filiais, com gerentes e supervisores
//   { action: 'create', parentId, name, address?, phone?, copyMenu? } → cria a filial (até o limite do plano)
//   { action: 'sync_menu', parentId, branchIds?, options }              → envia o cardápio da matriz para as filiais
//   { action: 'assign', restaurantId, role: 'manager'|'supervisor', email, password? } → liga gerente/supervisor
//   { action: 'unassign', restaurantId, userId, role }                                → desliga
// "restaurantId" pode ser a matriz ou qualquer filial dela.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['manager', 'supervisor']);

class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'Entre no sistema.' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    /** Matriz do grupo em que o dono (admin da matriz) está mexendo. */
    const ownerGroup = async (restaurantId: string) => {
      if (!UUID.test(restaurantId)) throw new HttpError('Loja inválida.');
      const { data: r } = await sb.from('restaurants').select('id, parent_id').eq('id', restaurantId).maybeSingle();
      if (!r) throw new HttpError('Loja não encontrada.', 404);
      const parentId = r.parent_id ?? r.id;
      const { data: parent } = await sb.from('restaurants').select('id, name, status, plan_code, branch_limit, parent_id').eq('id', parentId).single();
      const { data: owner } = await sb.from('user_roles').select('id').eq('user_id', user.id).eq('restaurant_id', parentId).eq('role', 'admin').maybeSingle();
      const { data: isSuper } = await sb.from('user_roles').select('id').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
      if (!owner && !isSuper) throw new HttpError('Só o dono (admin da matriz) gerencia as filiais.', 403);
      if (parent.status !== 'active') throw new HttpError('A matriz está bloqueada.', 403);
      const { data: plan } = await sb.from('plans').select('features').eq('code', parent.plan_code ?? 'enterprise').maybeSingle();
      if (plan?.features && (plan.features as Record<string, unknown>).branches === false) throw new HttpError('Filiais fazem parte do plano Enterprise.', 403);
      return parent;
    };

    // ---------- matriz, filiais e quem gerencia cada uma ----------
    if (action === 'list') {
      const parent = await ownerGroup(String(body?.parentId ?? ''));
      const { data: stores } = await sb.from('restaurants').select('id, name, address, phone, status, parent_id, created_at')
        .or(`id.eq.${parent.id},parent_id.eq.${parent.id}`).order('created_at');
      const ids = (stores ?? []).map(r => r.id);
      const { data: roles } = await sb.from('user_roles').select('user_id, restaurant_id, role').in('restaurant_id', ids).in('role', ['manager', 'supervisor']);
      const emails = new Map<string, string>();
      for (const uid of new Set((roles ?? []).map(r => r.user_id))) {
        const { data } = await sb.auth.admin.getUserById(uid);
        emails.set(uid, data.user?.email ?? '—');
      }
      const people = (rid: string, role: string) => (roles ?? []).filter(r => r.restaurant_id === rid && r.role === role)
        .map(r => ({ user_id: r.user_id, email: emails.get(r.user_id) ?? '—' }));
      return json({
        limit: parent.branch_limit,
        used: (stores ?? []).filter(r => r.parent_id).length,
        stores: (stores ?? []).map(r => ({ ...r, managers: people(r.id, 'manager'), supervisors: people(r.id, 'supervisor') })),
      });
    }

    // ---------- nova filial ----------
    if (action === 'create') {
      const parent = await ownerGroup(String(body?.parentId ?? ''));
      const name = String(body?.name ?? '').trim().slice(0, 120);
      if (!name) throw new HttpError('Informe o nome da filial.');
      const { count } = await sb.from('restaurants').select('id', { count: 'exact', head: true }).eq('parent_id', parent.id);
      if ((count ?? 0) >= parent.branch_limit) {
        throw new HttpError(parent.branch_limit ? `Limite de ${parent.branch_limit} filial(is) do plano atingido. Fale com a Oxys para aumentar.` : 'Filiais ainda não liberadas para esta loja. Fale com a Oxys.', 403);
      }
      const { data: branch, error } = await sb.from('restaurants').insert({
        name, address: String(body?.address ?? '').trim().slice(0, 200) || null, phone: String(body?.phone ?? '').trim().slice(0, 40) || null,
        parent_id: parent.id, plan_code: parent.plan_code, status: 'active',
      }).select('id, name').single();
      if (error) throw error;

      // os donos da matriz também administram a filial
      const { data: owners } = await sb.from('user_roles').select('user_id').eq('restaurant_id', parent.id).eq('role', 'admin');
      if (owners?.length) {
        const { error: e2 } = await sb.from('user_roles').insert(owners.map(o => ({ user_id: o.user_id, restaurant_id: branch.id, role: 'admin' })));
        if (e2) throw e2;
      }

      // identidade visual igual à da matriz; cardápio começa como cópia (depois é independente)
      const strip = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
        const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
        return { ...rest, restaurant_id: branch.id, ...extra };
      };
      const { data: brand } = await sb.from('branding_settings').select('*').eq('restaurant_id', parent.id).maybeSingle();
      if (brand) await sb.from('branding_settings').insert(strip(brand));

      let copied = 0;
      if (body?.copyMenu !== false) {
        const { data: cats } = await sb.from('menu_categories').select('*').eq('restaurant_id', parent.id);
        const catMap = new Map<string, string>();
        for (const c of cats ?? []) {
          const { data: nc, error: ec } = await sb.from('menu_categories').insert(strip(c, { source_id: c.id })).select('id').single();
          if (ec) throw ec;
          catMap.set(c.id, nc.id);
        }
        const { data: items } = await sb.from('menu_items').select('*').eq('restaurant_id', parent.id);
        const itemMap = new Map<string, string>();
        for (const it of items ?? []) {
          const { data: ni, error: ei } = await sb.from('menu_items')
            .insert(strip(it, { category_id: it.category_id ? catMap.get(it.category_id) ?? null : null, source_id: it.id, ifood_product_id: null }))
            .select('id').single();
          if (ei) throw ei;
          itemMap.set(it.id, ni.id);
          copied++;
        }
        const { data: comps } = await sb.from('menu_item_components').select('*').eq('restaurant_id', parent.id);
        const compRows = (comps ?? []).filter(c => itemMap.has(c.parent_item_id) && itemMap.has(c.component_item_id))
          .map(c => strip(c, { parent_item_id: itemMap.get(c.parent_item_id), component_item_id: itemMap.get(c.component_item_id) }));
        if (compRows.length) { const { error: e3 } = await sb.from('menu_item_components').insert(compRows); if (e3) throw e3; }
      }
      return json({ branch, copiedItems: copied });
    }

    // ---------- cardápio da matriz → filiais ----------
    // Cada filial continua com o cardápio dela; isto atualiza o que você escolher a partir da matriz.
    if (action === 'sync_menu') {
      const parent = await ownerGroup(String(body?.parentId ?? ''));
      if (String(body?.parentId) !== parent.id) throw new HttpError('Envie o cardápio a partir da matriz.');
      const o = body?.options ?? {};
      const opt = { newItems: o.newItems !== false, details: o.details !== false, prices: !!o.prices, availability: !!o.availability };
      if (!opt.newItems && !opt.details && !opt.prices && !opt.availability) throw new HttpError('Escolha o que enviar.');

      let q = sb.from('restaurants').select('id, name').eq('parent_id', parent.id);
      if (Array.isArray(body?.branchIds) && body.branchIds.length) q = q.in('id', body.branchIds.filter((x: unknown) => UUID.test(String(x))));
      const { data: branches } = await q;
      if (!branches?.length) throw new HttpError('Nenhuma filial escolhida.');

      const { data: mCats } = await sb.from('menu_categories').select('*').eq('restaurant_id', parent.id);
      const { data: mItems } = await sb.from('menu_items').select('*').eq('restaurant_id', parent.id);
      const { data: mComps } = await sb.from('menu_item_components').select('*').eq('restaurant_id', parent.id);
      const norm = (t: unknown) => String(t ?? '').trim().toLowerCase();
      const DETAILS = ['name', 'description', 'image_url', 'is_combo', 'ncm', 'cfop', 'csosn', 'origin', 'commercial_unit'];
      const report: Record<string, unknown>[] = [];

      for (const br of branches) {
        let created = 0, updated = 0;
        const { data: bCats } = await sb.from('menu_categories').select('*').eq('restaurant_id', br.id);
        const { data: bItems } = await sb.from('menu_items').select('*').eq('restaurant_id', br.id);

        // categorias: pela origem; cópias antigas sem origem, pelo nome (e passam a ter origem)
        const catMap = new Map<string, string>();
        for (const c of mCats ?? []) {
          let bc = (bCats ?? []).find(x => x.source_id === c.id) ?? (bCats ?? []).find(x => !x.source_id && norm(x.name) === norm(c.name));
          if (bc) {
            const patch: Record<string, unknown> = {};
            if (bc.source_id !== c.id) patch.source_id = c.id;
            if (opt.details && (bc.name !== c.name || bc.sort_order !== c.sort_order)) { patch.name = c.name; patch.sort_order = c.sort_order; }
            if (Object.keys(patch).length) { const { error } = await sb.from('menu_categories').update(patch).eq('id', bc.id); if (error) throw error; }
          } else if (opt.newItems || opt.details) {
            const { data: nc, error } = await sb.from('menu_categories')
              .insert({ restaurant_id: br.id, name: c.name, sort_order: c.sort_order, source_id: c.id }).select('*').single();
            if (error) throw error;
            bc = nc;
          }
          if (bc) catMap.set(c.id, bc.id);
        }

        // itens
        const itemMap = new Map<string, string>();
        for (const it of mItems ?? []) {
          const bi = (bItems ?? []).find(x => x.source_id === it.id) ?? (bItems ?? []).find(x => !x.source_id && norm(x.name) === norm(it.name));
          const category_id = it.category_id ? catMap.get(it.category_id) ?? null : null;
          if (bi) {
            const patch: Record<string, unknown> = {};
            if (bi.source_id !== it.id) patch.source_id = it.id;
            if (opt.details) {
              for (const k of DETAILS) if (bi[k] !== it[k]) patch[k] = it[k];
              if (bi.category_id !== category_id) patch.category_id = category_id;
            }
            if (opt.prices && Number(bi.price) !== Number(it.price)) patch.price = it.price;
            if (opt.availability && bi.available !== it.available) patch.available = it.available;
            const real = Object.keys(patch).filter(k => k !== 'source_id').length;
            if (Object.keys(patch).length) { const { error } = await sb.from('menu_items').update(patch).eq('id', bi.id); if (error) throw error; }
            if (real) updated++;
            itemMap.set(it.id, bi.id);
          } else if (opt.newItems) {
            const { id: _id, created_at: _c, updated_at: _u, ...rest } = it;
            const { data: ni, error } = await sb.from('menu_items')
              .insert({ ...rest, restaurant_id: br.id, category_id, source_id: it.id, ifood_product_id: null }).select('id').single();
            if (error) throw error;
            itemMap.set(it.id, ni.id);
            created++;
          }
        }

        // combos: refaz a composição dos combos enviados
        if (opt.details || opt.newItems) {
          for (const parentItem of (mItems ?? []).filter(x => x.is_combo && itemMap.has(x.id))) {
            const target = itemMap.get(parentItem.id)!;
            const rows = (mComps ?? []).filter(c => c.parent_item_id === parentItem.id && itemMap.has(c.component_item_id))
              .map(c => ({ restaurant_id: br.id, parent_item_id: target, component_item_id: itemMap.get(c.component_item_id), quantity: c.quantity }));
            await sb.from('menu_item_components').delete().eq('restaurant_id', br.id).eq('parent_item_id', target);
            if (rows.length) { const { error } = await sb.from('menu_item_components').insert(rows); if (error) throw error; }
          }
        }
        report.push({ id: br.id, name: br.name, created, updated });
      }
      return json({ branches: report });
    }

    // ---------- gerente / supervisor ----------
    if (action === 'assign') {
      const restaurantId = String(body?.restaurantId ?? '');
      const parent = await ownerGroup(restaurantId);
      const role = String(body?.role ?? '');
      if (!ROLES.has(role)) throw new HttpError('Cargo inválido.');
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError('Email inválido.');

      const { data: groupRows } = await sb.from('restaurants').select('id').or(`id.eq.${parent.id},parent_id.eq.${parent.id}`);
      const group = new Set((groupRows ?? []).map(r => r.id));

      let { data: userId } = await sb.rpc('find_user_id_by_email', { _email: email });
      const isNew = !userId;
      if (userId) {
        // a pessoa já existe: pode ser cliente da loja online ou da equipe deste grupo (nunca de outra empresa);
        // usa a mesma conta e a mesma senha que ela já tem
        const { data: theirRoles } = await sb.from('user_roles').select('restaurant_id, role').eq('user_id', userId);
        if ((theirRoles ?? []).some(r => !r.restaurant_id || !group.has(r.restaurant_id))) throw new HttpError('Este email já pertence a outra loja.', 409);
        if ((theirRoles ?? []).some(r => r.role === 'admin')) throw new HttpError('Esta pessoa já é dona/admin da rede.', 409);
        if ((theirRoles ?? []).some(r => r.restaurant_id === restaurantId)) throw new HttpError('Esta pessoa já tem um cargo nesta loja. Remova o cargo atual em Usuários primeiro.', 409);
      } else {
        const password = String(body?.password ?? '');
        if (password.length < 8) throw new HttpError('Crie uma senha com pelo menos 8 caracteres para a pessoa.');
        const { data: created, error: ce } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
        if (ce) throw new HttpError(ce.message);
        userId = created.user.id;
      }
      const { error: re } = await sb.from('user_roles').insert({ user_id: userId, restaurant_id: restaurantId, role });
      if (re) throw re;
      return json({ ok: true, userId, created: isNew });
    }

    if (action === 'unassign') {
      const restaurantId = String(body?.restaurantId ?? '');
      await ownerGroup(restaurantId);
      const role = String(body?.role ?? '');
      const userId = String(body?.userId ?? '');
      if (!ROLES.has(role) || !UUID.test(userId)) throw new HttpError('Dados inválidos.');
      const { error } = await sb.from('user_roles').delete().eq('user_id', userId).eq('restaurant_id', restaurantId).eq('role', role);
      if (error) throw error;
      await sb.from('user_active_restaurant').delete().eq('user_id', userId).eq('restaurant_id', restaurantId);
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('branches', e);
    const msg = (e as { message?: string })?.message ?? 'Erro interno';
    return json({ error: msg }, 500);
  }
});
