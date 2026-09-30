import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
export const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
export const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
export const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
export const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
export const GOOGLE_ADS_DEV_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
export const TIKTOK_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
export const TIKTOK_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
// Sem segredo próprio, assina o state do OAuth com a service role (também secreta).
const STATE_SECRET = Deno.env.get('MARKETING_STATE_SECRET') || SERVICE_ROLE;
// Endereço público que repassa para o storage (vercel.json → /media). O TikTok só aceita
// fotos vindas de um domínio verificado no painel dele.
export const MEDIA_PROXY_BASE = (Deno.env.get('MEDIA_PROXY_BASE') ?? 'https://www.oxysrestaurante.app/media').replace(/\/$/, '');
export const MEDIA_BUCKET = 'marketing-media';

export const GRAPH = 'https://graph.facebook.com/v21.0';
export const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v18';
export const TIKTOK_API = 'https://open.tiktokapis.com/v2';
export const OAUTH_REDIRECT = `${SUPABASE_URL}/functions/v1/marketing-oauth`;

export const configured = {
  meta: !!(META_APP_ID && META_APP_SECRET),
  google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  googleAds: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_ADS_DEV_TOKEN),
  tiktok: !!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET),
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export const adminClient = () => createClient(SUPABASE_URL, SERVICE_ROLE);

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Valida o usuário e a permissão no módulo de marketing do restaurante. */
export async function authorize(req: Request, restaurantId: unknown, edit: boolean) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado');
  if (typeof restaurantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(restaurantId)) throw new HttpError(400, 'Restaurante inválido');
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, 'Não autenticado');
  const admin = adminClient();
  const { data: ok } = await admin.rpc('has_module_access', { _user_id: user.id, _restaurant_id: restaurantId, _module: 'marketing', _edit: edit });
  const { data: plan } = await admin.rpc('restaurant_has_feature', { _restaurant_id: restaurantId, _feature: 'marketing' });
  const { data: active } = await admin.rpc('is_restaurant_active', { _restaurant_id: restaurantId });
  if (!ok || plan === false || active === false) throw new HttpError(403, 'Sem permissão para o marketing deste restaurante');
  return { user, admin };
}

// ---------- state assinado ----------
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}
export async function signState(payload: Record<string, unknown>) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })));
  return `${body}.${await hmac(body)}`;
}
export async function verifyState(state: string) {
  const [body, sig] = state.split('.');
  if (!body || !sig || (await hmac(body)) !== sig) throw new HttpError(400, 'Estado inválido');
  const data = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  if (data.exp < Date.now()) throw new HttpError(400, 'Link expirado, tente conectar novamente');
  return data as { restaurantId: string; userId: string; provider: 'meta' | 'google' | 'tiktok'; returnTo: string };
}
export async function verifyMetaSignature(raw: string, header: string | null) {
  if (!header?.startsWith('sha256=') || !META_APP_SECRET) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(META_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === header.slice(7);
}

// ---------- tokens ----------
const PROVIDER_LABEL = { meta: 'da Meta', google: 'do Google', tiktok: 'do TikTok' } as const;

export async function getCredential(admin: SupabaseClient, restaurantId: string, provider: 'meta' | 'google' | 'tiktok') {
  const { data } = await admin.from('marketing_credentials').select('*').eq('restaurant_id', restaurantId).eq('provider', provider).maybeSingle();
  if (!data) throw new HttpError(409, `Conecte a conta ${PROVIDER_LABEL[provider]} primeiro`);
  if (provider === 'tiktok' && (!data.expires_at || new Date(data.expires_at).getTime() < Date.now() + 60_000)) {
    if (!data.refresh_token) throw new HttpError(409, 'O acesso ao TikTok expirou, reconecte a conta');
    const t = await tiktokToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token });
    await admin.from('marketing_credentials').update({
      access_token: t.access_token, refresh_token: t.refresh_token ?? data.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    }).eq('id', data.id);
    return t.access_token as string;
  }
  if (provider === 'google' && data.refresh_token && (!data.expires_at || new Date(data.expires_at).getTime() < Date.now() + 60_000)) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
    });
    const t = await r.json();
    if (!r.ok) throw new HttpError(409, 'O acesso ao Google expirou, reconecte a conta');
    const expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
    await admin.from('marketing_credentials').update({ access_token: t.access_token, expires_at }).eq('id', data.id);
    return t.access_token as string;
  }
  if (provider === 'meta' && data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new HttpError(409, 'O acesso à Meta expirou, reconecte a conta');
  }
  return data.access_token as string;
}

export async function getAccount(admin: SupabaseClient, restaurantId: string, kind: string) {
  const { data } = await admin.from('marketing_accounts').select('*').eq('restaurant_id', restaurantId).eq('kind', kind).eq('selected', true).maybeSingle();
  if (!data) throw new HttpError(409, 'Selecione a conta deste canal em Conexões');
  return data;
}

// ---------- chamadas ----------
async function parse(r: Response, label: string) {
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) {
    const msg = body?.error?.error_user_msg || body?.error?.message || (typeof body === 'string' ? body : JSON.stringify(body));
    console.error(`${label} [${r.status}]`, text);
    throw new HttpError(r.status >= 500 ? 502 : 400, `${label}: ${String(msg).slice(0, 300)}`);
  }
  return body;
}

export async function graph(path: string, token: string, opts: { method?: string; params?: Record<string, unknown> } = {}) {
  const method = opts.method ?? 'GET';
  const url = new URL(`${GRAPH}${path}`);
  const params = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined && v !== null) params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (method === 'GET') { params.forEach((v, k) => url.searchParams.set(k, v)); return parse(await fetch(url), 'Meta'); }
  return parse(await fetch(url, { method, body: params }), 'Meta');
}

export async function google(url: string, token: string, opts: { method?: string; body?: unknown; ads?: boolean } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (opts.ads) headers['developer-token'] = GOOGLE_ADS_DEV_TOKEN;
  return parse(await fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined }), 'Google');
}

/** Troca de código/refresh por token no TikTok. */
export async function tiktokToken(params: Record<string, string>) {
  const r = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, ...params }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) {
    console.error('TikTok token', r.status, JSON.stringify(t));
    throw new HttpError(409, 'O TikTok recusou o acesso, reconecte a conta');
  }
  return t;
}

/** Chamada à API do TikTok; lança erro com a mensagem deles. */
export async function tiktok(path: string, token: string, body?: unknown) {
  const r = await fetch(`${TIKTOK_API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let res: any = null;
  try { res = JSON.parse(text); } catch { res = { error: { message: text } }; }
  if (!r.ok || (res?.error?.code && res.error.code !== 'ok')) {
    console.error(`TikTok ${path} [${r.status}]`, text);
    throw new HttpError(r.status >= 500 ? 502 : 400, `TikTok: ${String(res?.error?.message || res?.error?.code || text).slice(0, 300)}`);
  }
  return res.data;
}

/** URL assinada da mídia, direto do storage (Meta) ou pelo domínio público (TikTok). */
export async function mediaUrl(admin: SupabaseClient, path: string, viaProxy = false) {
  const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (error || !data?.signedUrl) throw new HttpError(500, 'Não foi possível gerar o link da mídia');
  if (!viaProxy) return data.signedUrl;
  const u = new URL(data.signedUrl);
  return `${MEDIA_PROXY_BASE}${u.pathname.replace(/^\/storage\/v1\/object\/sign/, '')}${u.search}`;
}

export async function signedImage(admin: SupabaseClient, path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await admin.storage.from('menu-images').createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}
