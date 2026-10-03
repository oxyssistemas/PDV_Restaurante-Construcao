import { createClient } from 'npm:@supabase/supabase-js@2';

// Servidor dedicado por loja ("Oxys Servidor").
//   Super admin (logado):    { action: 'enable', restaurantId, enabled }      → libera / bloqueia o recurso
//                            { action: 'code', restaurantId }                 → código de instalação (vale 24 h, uso único)
//                            { action: 'purge', restaurantId, confirm }       → apaga da nuvem os dados já migrados
//                            { action: 'unlink', restaurantId }               → desliga o servidor instalado (para reinstalar)
//   Instalação (sem login):  { action: 'activate', code, lanUrls?, version? } → chave do servidor
//   Servidor (x-server-key): { action: 'schema' }                             → tabelas, ligações, padrões e regras de acesso
//                            { action: 'export', table, offset, limit }       → dados da loja para a migração
//                            { action: 'migrated', rows }                     → migração concluída
//                            { action: 'control', publicUrl?, lanUrls?, version?, ownSupabaseUrl? } → equipe, login, plano e situação

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-server-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_OK = (u: unknown) => typeof u === 'string' && /^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(u);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
// código fácil de digitar: sem 0/O, 1/I/L
function activationCode() {
  const abc = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const v = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(v, x => abc[x % abc.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
const normCode = (c: unknown) => String(c ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    // ---------- instalação: troca o código pela chave do servidor ----------
    if (action === 'activate') {
      const code = normCode(body?.code);
      if (code.length !== 8) return json({ error: 'Código inválido.' }, 400);
      const { data: srv } = await sb.from('dedicated_servers')
        .select('restaurant_id, enabled, migrated_at, activation_expires_at')
        .eq('activation_code_hash', await sha256(code)).maybeSingle();
      if (!srv || !srv.enabled || !srv.activation_expires_at || Date.parse(srv.activation_expires_at) < Date.now()) {
        return json({ error: 'Código inválido ou vencido. Gere outro no menu do super admin.' }, 400);
      }
      const key = randomHex(32);
      const lanUrls = Array.isArray(body?.lanUrls) ? body.lanUrls.filter(URL_OK).slice(0, 6) : [];
      await sb.from('dedicated_servers').update({
        key_hash: await sha256(key), activation_code_hash: null, activation_expires_at: null,
        status: srv.migrated_at ? 'active' : 'migrating', lan_urls: lanUrls, last_seen_at: new Date().toISOString(),
        ...(typeof body?.version === 'string' ? { version: body.version.slice(0, 20) } : {}),
      }).eq('restaurant_id', srv.restaurant_id);
      const { data: r } = await sb.from('restaurants').select('name').eq('id', srv.restaurant_id).maybeSingle();
      return json({ key, restaurantId: srv.restaurant_id, restaurantName: r?.name ?? null, migrated: !!srv.migrated_at });
    }

    // ---------- chamadas do servidor instalado ----------
    const serverKey = req.headers.get('x-server-key');
    if (serverKey) {
      const { data: srv } = await sb.from('dedicated_servers')
        .select('restaurant_id, enabled, status, migrated_at, cloud_purged_at').eq('key_hash', await sha256(serverKey)).maybeSingle();
      if (!srv) return json({ error: 'Servidor não reconhecido. Ative de novo com um código novo.' }, 401);
      const rid = srv.restaurant_id;

      if (action === 'control') {
        const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
        if (body?.publicUrl === null || URL_OK(body?.publicUrl)) patch.public_url = body.publicUrl;
        if (Array.isArray(body?.lanUrls)) patch.lan_urls = body.lanUrls.filter(URL_OK).slice(0, 6);
        if (typeof body?.version === 'string') patch.version = body.version.slice(0, 20);
        if (body?.ownSupabaseUrl === null || URL_OK(body?.ownSupabaseUrl)) patch.own_supabase_url = body.ownSupabaseUrl;
        await sb.from('dedicated_servers').update(patch).eq('restaurant_id', rid);
        // equipe, papéis, login (hash das senhas, como na central offline), restaurante e plano
        const { data: rep, error } = await sb.rpc('offline_replica', { _restaurant_id: rid });
        if (error) throw error;
        return json({
          restaurantId: rid, enabled: srv.enabled, status: srv.status,
          restaurants: rep.rows.restaurants, plans: rep.rows.plans, user_roles: rep.rows.user_roles,
          staff: rep.staff, generated_at: rep.generated_at,
        });
      }
      if (!srv.enabled) return json({ error: 'Servidor dedicado desativado para esta loja.' }, 403);

      if (action === 'schema') {
        const { data, error } = await sb.rpc('dedicated_schema');
        if (error) throw error;
        return json(data);
      }
      if (action === 'export') {
        if (srv.cloud_purged_at) return json({ error: 'Os dados desta loja já foram apagados da nuvem.' }, 410);
        const limit = Math.min(2000, Math.max(1, Number(body?.limit) || 1000));
        const { data, error } = await sb.rpc('dedicated_export', {
          _restaurant_id: rid, _table: String(body?.table ?? ''), _offset: Math.max(0, Number(body?.offset) || 0), _limit: limit,
        });
        if (error) throw error;
        return json({ rows: data });
      }
      if (action === 'migrated') {
        await sb.from('dedicated_servers').update({
          status: 'active', migrated_at: new Date().toISOString(), migrated_rows: Math.max(0, Math.floor(Number(body?.rows) || 0)),
        }).eq('restaurant_id', rid);
        return json({ ok: true });
      }
      return json({ error: 'Ação inválida.' }, 400);
    }

    // ---------- super admin ----------
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'Entre no sistema.' }, 401);
    const { data: isSuper } = await sb.rpc('has_role', { _user_id: user.id, _role: 'super_admin' });
    if (!isSuper) return json({ error: 'Só o super admin gerencia servidores dedicados.' }, 403);
    const restaurantId = String(body?.restaurantId ?? '');
    if (!UUID.test(restaurantId)) return json({ error: 'Restaurante inválido.' }, 400);

    if (action === 'enable') {
      const enabled = !!body?.enabled;
      const { error } = await sb.from('dedicated_servers').upsert({ restaurant_id: restaurantId, enabled }, { onConflict: 'restaurant_id' });
      if (error) throw error;
      return json({ ok: true, enabled });
    }
    if (action === 'code') {
      const { data: srv } = await sb.from('dedicated_servers').select('enabled').eq('restaurant_id', restaurantId).maybeSingle();
      if (!srv?.enabled) return json({ error: 'Libere o servidor dedicado para esta loja primeiro.' }, 400);
      const code = activationCode();
      await sb.from('dedicated_servers').update({
        activation_code_hash: await sha256(normCode(code)), activation_expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
      }).eq('restaurant_id', restaurantId);
      return json({ code, expiresInHours: 24 });
    }
    if (action === 'unlink') {
      await sb.from('dedicated_servers').update({ key_hash: null, public_url: null, lan_urls: [] }).eq('restaurant_id', restaurantId);
      return json({ ok: true });
    }
    if (action === 'purge') {
      const { data: r } = await sb.from('restaurants').select('name').eq('id', restaurantId).maybeSingle();
      if (!r || String(body?.confirm ?? '').trim() !== r.name.trim()) return json({ error: 'Digite o nome da loja exatamente para confirmar.' }, 400);
      const { data, error } = await sb.rpc('dedicated_purge_cloud', { _restaurant_id: restaurantId });
      if (error) throw error;
      return json({ ok: true, removed: data });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('dedicated-server', e);
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});
