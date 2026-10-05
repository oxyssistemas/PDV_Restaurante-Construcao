import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Lojas com servidor dedicado: os dados delas moram no servidor da loja. A loja online, o cardápio QR e a
// avaliação continuam no mesmo endereço (www.oxysrestaurante.app) e a nuvem repassa a chamada para o servidor,
// assinada com o segredo combinado (o servidor confere a assinatura antes de aceitar o cliente informado).

export type DedicatedTarget = { restaurantId: string; url: string; secret: string };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Servidor dedicado ativo da loja (ou null: a loja usa a nuvem). */
export async function dedicatedFor(sb: SupabaseClient, by: { restaurantId?: string | null; slug?: string | null }): Promise<DedicatedTarget | null | 'offline'> {
  let q = sb.from('dedicated_servers').select('restaurant_id, status, enabled, public_url, relay_secret');
  if (by.restaurantId) q = q.eq('restaurant_id', by.restaurantId);
  else if (by.slug) q = q.eq('store_slug', by.slug);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data || data.status !== 'active' || !data.enabled) return null;
  if (!data.public_url || !data.relay_secret) return 'offline';
  return { restaurantId: data.restaurant_id, url: String(data.public_url).replace(/\/$/, ''), secret: data.relay_secret };
}

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Repassa a chamada para a mesma função no servidor da loja. user/profile: cliente confirmado aqui na nuvem. */
export async function relay(target: DedicatedTarget | 'offline', fn: string, body: Record<string, unknown>,
  extra: { user?: { id: string; email?: string | null } | null; profile?: Record<string, unknown> | null } = {}) {
  const reply = (b: unknown, status: number) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (target === 'offline') return reply({ error: 'A loja está temporariamente fora do ar. Tente de novo em alguns minutos.' }, 503);
  const { r: _r, ...rest } = body;
  const payload = JSON.stringify({ ...rest, relay_at: Date.now(), relay_user: extra.user ?? null, relay_profile: extra.profile ?? null });
  try {
    const res = await fetch(`${target.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-oxys-relay': await hmac(target.secret, payload) },
      body: payload,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch {
    return reply({ error: 'A loja está temporariamente fora do ar. Tente de novo em alguns minutos.' }, 503);
  }
}
