import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { adminClient, ANON_KEY, HttpError, json, SUPABASE_URL } from '../_shared/marketing.ts';
import { handleOrderEvent, sendText } from '../_shared/whatsappBot.ts';

// Robô de WhatsApp:
//  - banco de dados (x-bot-secret): { event: 'created' | 'status', order_id } → avisa o cliente;
//  - equipe do delivery (login): conversa assumida, resposta manual, número conectado.

async function staff(req: Request, restaurantId: unknown) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado');
  if (typeof restaurantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(restaurantId)) throw new HttpError(400, 'Restaurante inválido');
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) throw new HttpError(401, 'Não autenticado');
  const { data: ok } = await user.rpc('is_delivery_staff', { _restaurant_id: restaurantId });
  if (!ok) throw new HttpError(403, 'Sem permissão para o delivery deste restaurante');
  return me;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  try {
    const b = await req.json().catch(() => ({}));

    const secret = req.headers.get('x-bot-secret');
    if (secret) {
      const { data: expected } = await admin.rpc('whatsapp_bot_secret');
      if (!expected || secret !== expected) return json({ error: 'forbidden' }, 403);
      if (typeof b.order_id !== 'string') return json({ error: 'order_id' }, 400);
      try {
        return json(await handleOrderEvent(admin, b.order_id, b.event === 'created' ? 'created' : 'status'));
      } catch (e) {
        console.error('whatsapp-bot order', b.order_id, e);
        return json({ error: e instanceof Error ? e.message : 'erro' }, 200);
      }
    }

    const rid: string = b.restaurantId;
    const me = await staff(req, rid);
    const conversation = async () => {
      const { data } = await admin.from('whatsapp_conversations').select('id, phone, restaurant_id').eq('id', b.conversationId).eq('restaurant_id', rid).maybeSingle();
      if (!data) throw new HttpError(404, 'Conversa não encontrada');
      return data;
    };

    switch (b.action) {
      case 'overview': { // número conectado e contas disponíveis
        const [{ data: creds }, { data: accounts }] = await Promise.all([
          admin.from('marketing_credentials').select('provider, expires_at').eq('restaurant_id', rid).eq('provider', 'meta').maybeSingle(),
          admin.from('marketing_accounts').select('id, name, selected').eq('restaurant_id', rid).eq('kind', 'whatsapp').order('name'),
        ]);
        return json({ metaConnected: !!creds, accounts: accounts ?? [] });
      }
      case 'select_account': {
        const { data: acc } = await admin.from('marketing_accounts').select('id').eq('id', b.accountId).eq('restaurant_id', rid).eq('kind', 'whatsapp').maybeSingle();
        if (!acc) throw new HttpError(404, 'Número não encontrado');
        await admin.from('marketing_accounts').update({ selected: false }).eq('restaurant_id', rid).eq('kind', 'whatsapp');
        await admin.from('marketing_accounts').update({ selected: true }).eq('id', acc.id);
        return json({ ok: true });
      }
      case 'send': { // atendente responde: o robô fica pausado nessa conversa
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        if (!text || text.length > 4000) throw new HttpError(400, 'Escreva a mensagem');
        const conv = await conversation();
        const { data: settings } = await admin.from('whatsapp_bot_settings').select('human_pause_minutes').eq('restaurant_id', rid).maybeSingle();
        const until = new Date(Date.now() + (settings?.human_pause_minutes ?? 60) * 60_000).toISOString();
        await sendText(admin, rid, conv, text, me.id);
        await admin.from('whatsapp_conversations').update({ bot_paused_until: until, needs_human: false }).eq('id', conv.id);
        return json({ ok: true });
      }
      case 'resume_bot': {
        const conv = await conversation();
        await admin.from('whatsapp_conversations').update({ bot_paused_until: null, needs_human: false }).eq('id', conv.id);
        return json({ ok: true });
      }
      case 'pause_bot': {
        const conv = await conversation();
        await admin.from('whatsapp_conversations').update({ bot_paused_until: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }).eq('id', conv.id);
        return json({ ok: true });
      }
      default:
        throw new HttpError(400, 'Ação inválida');
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('whatsapp-bot', e);
    return json({ error: 'Erro interno' }, 500);
  }
});
