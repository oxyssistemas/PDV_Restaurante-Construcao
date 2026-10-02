import { createClient } from 'npm:@supabase/supabase-js@2';

// Central offline (app de computador do caixa).
//   Equipe logada (admin):  { action: 'activate', restaurantId, name? } → gera/troca a chave da central
//                           { action: 'deactivate', restaurantId }
//   Central (x-hub-key):    { action: 'snapshot', lanUrls?, version?, pendingOps? } → retrato da loja
//                           { action: 'push', ops: [...] }                         → aplica o que foi feito sem internet

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    // ---------- chamadas da central ----------
    const hubKey = req.headers.get('x-hub-key');
    if (hubKey) {
      const { data: hub } = await sb.from('offline_hubs').select('id, restaurant_id').eq('key_hash', await sha256(hubKey)).maybeSingle();
      if (!hub) return json({ error: 'Central não reconhecida. Ative de novo pelo sistema.' }, 401);
      const { data: active } = await sb.rpc('is_restaurant_active', { _restaurant_id: hub.restaurant_id });
      if (active === false) return json({ error: 'Restaurante bloqueado.' }, 403);

      if (action === 'snapshot') {
        const lanUrls = Array.isArray(body?.lanUrls) ? body.lanUrls.filter((u: unknown) => typeof u === 'string' && /^http:\/\/[\w.-]+(:\d+)?\/?$/.test(u)).slice(0, 6) : undefined;
        await sb.from('offline_hubs').update({
          last_seen_at: new Date().toISOString(),
          ...(lanUrls ? { lan_urls: lanUrls } : {}),
          ...(typeof body?.version === 'string' ? { version: body.version.slice(0, 20) } : {}),
          ...(Number.isFinite(body?.pendingOps) ? { pending_ops: Math.max(0, Math.floor(body.pendingOps)) } : {}),
        }).eq('id', hub.id);
        const { data, error } = await sb.rpc('offline_snapshot', { _restaurant_id: hub.restaurant_id });
        if (error) throw error;
        return json({ hubId: hub.id, snapshot: data });
      }

      if (action === 'push') {
        const ops = Array.isArray(body?.ops) ? body.ops.slice(0, 500) : [];
        if (!ops.every((o: any) => UUID.test(String(o?.id ?? '')) && typeof o?.type === 'string')) return json({ error: 'Operações inválidas.' }, 400);
        const { data, error } = await sb.rpc('apply_offline_ops', { _hub_id: hub.id, _ops: ops });
        if (error) throw error;
        return json(data);
      }
      return json({ error: 'Ação inválida.' }, 400);
    }

    // ---------- chamadas da equipe (ativar/desativar) ----------
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'Entre no sistema.' }, 401);
    const restaurantId = String(body?.restaurantId ?? '');
    if (!UUID.test(restaurantId)) return json({ error: 'Restaurante inválido.' }, 400);
    const { data: roles } = await sb.from('user_roles').select('role, restaurant_id').eq('user_id', user.id);
    const allowed = (roles ?? []).some(r => r.role === 'super_admin' || (r.role === 'admin' && r.restaurant_id === restaurantId));
    if (!allowed) return json({ error: 'Só o administrador do restaurante ativa a central offline.' }, 403);

    if (action === 'activate') {
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
      const name = String(body?.name ?? 'Computador do caixa').trim().slice(0, 60) || 'Computador do caixa';
      const { data: hub, error } = await sb.from('offline_hubs').upsert({
        restaurant_id: restaurantId, key_hash: await sha256(key), name, created_by: user.id, lan_urls: [], last_seen_at: null,
      }, { onConflict: 'restaurant_id' }).select('id').single();
      if (error) throw error;
      return json({ hubId: hub.id, key, restaurantId });
    }

    if (action === 'deactivate') {
      await sb.from('offline_hubs').delete().eq('restaurant_id', restaurantId);
      return json({ ok: true });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('offline-hub', e);
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});
