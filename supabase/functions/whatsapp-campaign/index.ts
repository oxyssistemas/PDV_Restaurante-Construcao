import { createClient } from 'npm:@supabase/supabase-js@2';

// Campanha de WhatsApp (envio automático com modelo aprovado na Meta), em lotes:
//   { restaurantId, campaignId } → manda até 40 mensagens pendentes e devolve quantas faltam.
// O número é o WhatsApp Business conectado em Marketing → Conexões. Fora da janela de 24 h a Meta só aceita modelo aprovado.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH = 'https://graph.facebook.com/v21.0';
const BATCH = 40;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return json({ error: 'Entre no sistema.' }, 401);
    const body = await req.json().catch(() => ({}));
    const rid = String(body?.restaurantId ?? ''), cid = String(body?.campaignId ?? '');
    if (!UUID.test(rid) || !UUID.test(cid)) return json({ error: 'Campanha inválida.' }, 400);

    const [{ data: ok }, { data: plan }] = await Promise.all([
      admin.rpc('has_module_access', { _user_id: auth.user.id, _restaurant_id: rid, _module: 'marketing', _edit: true }),
      admin.rpc('restaurant_has_feature', { _restaurant_id: rid, _feature: 'marketing' }),
    ]);
    if (!ok || plan === false) return json({ error: 'Sem permissão para o marketing desta loja.' }, 403);

    const { data: c } = await admin.from('whatsapp_campaigns').select('*').eq('id', cid).eq('restaurant_id', rid).maybeSingle();
    if (!c) return json({ error: 'Campanha não encontrada.' }, 404);
    if (c.mode !== 'template' || !c.template_name) return json({ error: 'Esta campanha é de envio assistido.' }, 400);

    const [{ data: cred }, { data: wa }] = await Promise.all([
      admin.from('marketing_credentials').select('access_token, expires_at').eq('restaurant_id', rid).eq('provider', 'meta').maybeSingle(),
      admin.from('marketing_accounts').select('external_id').eq('restaurant_id', rid).eq('kind', 'whatsapp').eq('selected', true).maybeSingle(),
    ]);
    if (!cred?.access_token || !wa?.external_id) return json({ error: 'Conecte o WhatsApp Business em Marketing → Conexões.' }, 409);
    if (cred.expires_at && new Date(cred.expires_at).getTime() < Date.now()) return json({ error: 'O acesso à Meta expirou, reconecte a conta.' }, 409);

    await admin.from('whatsapp_campaigns').update({ status: 'sending' }).eq('id', cid);
    const { data: batch } = await admin.from('whatsapp_campaign_recipients').select('id, phone, name').eq('campaign_id', cid).eq('status', 'pending').limit(BATCH);
    let sent = 0, failed = 0;
    for (const r of batch ?? []) {
      const first = String(r.name ?? '').trim().split(/\s+/)[0] || 'cliente';
      const params = new URLSearchParams({
        access_token: cred.access_token, messaging_product: 'whatsapp', to: r.phone, type: 'template',
        template: JSON.stringify({
          name: c.template_name, language: { code: c.template_lang || 'pt_BR' },
          ...(body?.withName !== false ? { components: [{ type: 'body', parameters: [{ type: 'text', text: first }] }] } : {}),
        }),
      });
      const res = await fetch(`${GRAPH}/${wa.external_id}/messages`, { method: 'POST', body: params });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        sent++;
        await admin.from('whatsapp_campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', r.id);
      } else {
        failed++;
        await admin.from('whatsapp_campaign_recipients').update({ status: 'failed', error: String(out?.error?.message ?? res.status).slice(0, 200) }).eq('id', r.id);
      }
      await new Promise(x => setTimeout(x, 120)); // não estourar o limite da Meta
    }
    const { count: left } = await admin.from('whatsapp_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).eq('status', 'pending');
    await admin.from('whatsapp_campaigns').update({ sent: (c.sent ?? 0) + sent, failed: (c.failed ?? 0) + failed, status: left ? 'sending' : 'done' }).eq('id', cid);
    return json({ sent, failed, left: left ?? 0 });
  } catch (e) {
    console.error('whatsapp-campaign', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
