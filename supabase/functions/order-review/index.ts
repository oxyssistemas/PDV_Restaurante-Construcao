import { createClient } from 'npm:@supabase/supabase-js@2';
import { dedicatedFor, relay } from '../_shared/relay.ts';

// Avaliação pós-pedido (pública, sem login): www.oxysrestaurante.app/avaliar/<código do pedido>
//   { action: 'get', token }                                          → loja, itens e a avaliação já feita
//   { action: 'submit', token, score, comment?, food?, service?, speed? } → grava a nota (uma por pedido)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.trunc(Number(v)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '');
    if (!UUID.test(token)) return json({ error: 'Pedido não encontrado.' }, 404);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // loja com servidor dedicado (o link leva ?r=<loja>): o servidor da loja responde
    if (typeof body?.r === 'string' && UUID.test(body.r)) {
      const target = await dedicatedFor(sb, { restaurantId: body.r });
      if (target) return relay(target, 'order-review', body);
    }

    if (body?.action === 'submit') {
      const { error } = await sb.rpc('submit_review', {
        _token: token, _score: int(body.score), _comment: typeof body.comment === 'string' ? body.comment.slice(0, 1000) : null,
        _food: int(body.food), _service: int(body.service), _speed: int(body.speed),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    const { data, error } = await sb.rpc('review_info', { _token: token });
    if (error || !data) return json({ error: 'Pedido não encontrado.' }, 404);
    const info = data as Record<string, unknown>;
    // logo guardada no armazenamento privado: link temporário
    const logo = typeof info.logo === 'string' && info.logo && !info.logo.startsWith('http')
      ? (await sb.storage.from('menu-images').createSignedUrl(info.logo, 3600)).data?.signedUrl ?? null
      : info.logo || null;
    return json({ ...info, logo });
  } catch (e) {
    console.error('order-review', e);
    return json({ error: 'Erro inesperado. Tente novamente.' }, 500);
  }
});
