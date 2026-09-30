import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  adminClient, authorize, configured, GOOGLE_ADS_API, GOOGLE_ADS_DEV_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  GRAPH, HttpError, json, META_APP_ID, META_APP_SECRET, OAUTH_REDIRECT, signState, verifyState,
} from '../_shared/marketing.ts';

const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement', 'pages_read_user_content', 'read_insights',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights',
  'whatsapp_business_management', 'whatsapp_business_messaging', 'business_management', 'ads_management', 'ads_read',
].join(',');
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/adwords';

const allowedReturn = (u: string) => {
  try {
    const { hostname, protocol } = new URL(u);
    return (protocol === 'https:' && (hostname === 'oxysrestaurante.app' || hostname === 'www.oxysrestaurante.app')) || hostname === 'localhost';
  } catch { return false; }
};

const redirect = (to: string, params: Record<string, string>) => {
  const u = new URL(to);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
};

type Acc = { kind: string; external_id: string; name: string | null; parent_id?: string | null; metadata?: Record<string, unknown> };

async function discoverMeta(token: string): Promise<Acc[]> {
  const out: Acc[] = [];
  const get = async (path: string) => { const r = await fetch(`${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${token}`); return r.ok ? r.json() : { data: [] }; };
  const pages = await get('/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100');
  for (const p of pages.data ?? []) {
    out.push({ kind: 'facebook_page', external_id: p.id, name: p.name, metadata: { page_token: p.access_token } });
    if (p.instagram_business_account) out.push({ kind: 'instagram', external_id: p.instagram_business_account.id, name: `@${p.instagram_business_account.username}`, parent_id: p.id, metadata: { page_token: p.access_token } });
  }
  const ads = await get('/me/adaccounts?fields=account_id,name,currency&limit=100');
  for (const a of ads.data ?? []) out.push({ kind: 'meta_ads', external_id: a.account_id, name: a.name, metadata: { currency: a.currency } });
  const biz = await get('/me/businesses?fields=owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&limit=50');
  for (const b of biz.data ?? []) for (const w of b.owned_whatsapp_business_accounts?.data ?? []) for (const n of w.phone_numbers?.data ?? []) {
    out.push({ kind: 'whatsapp', external_id: n.id, name: `${n.verified_name ?? w.name} · ${n.display_phone_number}`, parent_id: w.id });
  }
  return out;
}

async function discoverGoogle(token: string): Promise<Acc[]> {
  const out: Acc[] = [];
  const h = { Authorization: `Bearer ${token}` };
  const accs = await (await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: h })).json().catch(() => ({}));
  for (const a of accs.accounts ?? []) {
    const locs = await (await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, { headers: h })).json().catch(() => ({}));
    for (const l of locs.locations ?? []) out.push({ kind: 'google_location', external_id: l.name, name: l.title, parent_id: a.name });
  }
  if (GOOGLE_ADS_DEV_TOKEN) {
    const r = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, { headers: { ...h, 'developer-token': GOOGLE_ADS_DEV_TOKEN } });
    const c = r.ok ? await r.json() : {};
    for (const rn of c.resourceNames ?? []) { const id = rn.split('/')[1]; out.push({ kind: 'google_ads', external_id: id, name: `Conta ${id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}` }); }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);

  // Retorno do provedor (navegador)
  if (req.method === 'GET' && url.searchParams.has('state')) {
    let returnTo = 'https://oxysrestaurante.app/marketing/connections';
    try {
      const st = await verifyState(url.searchParams.get('state')!);
      returnTo = st.returnTo;
      if (url.searchParams.get('error')) return redirect(returnTo, { connect_error: 'Conexão cancelada' });
      const code = url.searchParams.get('code');
      if (!code) throw new HttpError(400, 'Código ausente');
      const admin = adminClient();
      let access_token: string, refresh_token: string | null = null, expires_at: string | null = null, accounts: Acc[];

      if (st.provider === 'meta') {
        const t1 = await (await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: OAUTH_REDIRECT, code })}`)).json();
        if (!t1.access_token) throw new HttpError(400, 'A Meta recusou a conexão');
        const t2 = await (await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: META_APP_ID, client_secret: META_APP_SECRET, fb_exchange_token: t1.access_token })}`)).json();
        access_token = t2.access_token ?? t1.access_token;
        expires_at = new Date(Date.now() + (t2.expires_in ?? 60 * 24 * 3600) * 1000).toISOString();
        accounts = await discoverMeta(access_token);
      } else {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: OAUTH_REDIRECT, code, grant_type: 'authorization_code' }),
        });
        const t = await r.json();
        if (!t.access_token) throw new HttpError(400, 'O Google recusou a conexão');
        access_token = t.access_token; refresh_token = t.refresh_token ?? null;
        expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
        accounts = await discoverGoogle(access_token);
      }

      const { data: prev } = await admin.from('marketing_credentials').select('refresh_token').eq('restaurant_id', st.restaurantId).eq('provider', st.provider).maybeSingle();
      await admin.from('marketing_credentials').upsert({
        restaurant_id: st.restaurantId, provider: st.provider, access_token, refresh_token: refresh_token ?? prev?.refresh_token ?? null,
        expires_at, connected_by: st.userId,
      }, { onConflict: 'restaurant_id,provider' });

      const kinds = [...new Set(accounts.map(a => a.kind))];
      const { data: existing } = await admin.from('marketing_accounts').select('kind, external_id, selected').eq('restaurant_id', st.restaurantId);
      for (const kind of kinds) {
        const list = accounts.filter(a => a.kind === kind);
        const hadSelected = (existing ?? []).find(e => e.kind === kind && e.selected && list.some(l => l.external_id === e.external_id));
        for (const [i, a] of list.entries()) {
          await admin.from('marketing_accounts').upsert({
            restaurant_id: st.restaurantId, provider: st.provider, kind, external_id: a.external_id, name: a.name,
            parent_id: a.parent_id ?? null, metadata: a.metadata ?? {},
            selected: hadSelected ? hadSelected.external_id === a.external_id : i === 0,
          }, { onConflict: 'restaurant_id,kind,external_id' });
        }
      }
      // Assina o WhatsApp da conta para receber mensagens
      if (st.provider === 'meta') {
        for (const w of new Set(accounts.filter(a => a.kind === 'whatsapp').map(a => a.parent_id))) {
          await fetch(`${GRAPH}/${w}/subscribed_apps`, { method: 'POST', body: new URLSearchParams({ access_token }) }).catch(() => null);
        }
      }
      return redirect(returnTo, { connected: st.provider });
    } catch (e) {
      console.error('oauth callback', e);
      return redirect(returnTo, { connect_error: e instanceof Error ? e.message : 'Falha ao conectar' });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'config') return json({ configured, redirectUri: OAUTH_REDIRECT });
    const { user } = await authorize(req, body.restaurantId, true);
    if (body.action !== 'start') throw new HttpError(400, 'Ação inválida');
    const provider = body.provider;
    if (provider !== 'meta' && provider !== 'google') throw new HttpError(400, 'Provedor inválido');
    if (!configured[provider]) throw new HttpError(409, 'Esta integração ainda está aguardando liberação do Oxys');
    const returnTo = String(body.returnTo ?? '');
    if (!allowedReturn(returnTo)) throw new HttpError(400, 'Endereço de retorno inválido');
    const state = await signState({ restaurantId: body.restaurantId, userId: user.id, provider, returnTo });
    const authUrl = provider === 'meta'
      ? `https://www.facebook.com/v21.0/dialog/oauth?${new URLSearchParams({ client_id: META_APP_ID, redirect_uri: OAUTH_REDIRECT, state, scope: META_SCOPES, response_type: 'code' })}`
      : `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: OAUTH_REDIRECT, state, scope: GOOGLE_SCOPES, response_type: 'code', access_type: 'offline', prompt: 'consent' })}`;
    return json({ url: authUrl });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : 'Erro' }, status);
  }
});
