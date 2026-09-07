import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  admin, credentialsError, ifoodFetch, json, requireRestaurantAccess,
} from '../_shared/ifood.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
    const open = typeof body?.open === 'boolean' ? body.open : null;
    if (!restaurantId || open === null) return json({ error: 'Requisição inválida' }, 400);

    const access = await requireRestaurantAccess(req, restaurantId, ['admin', 'kitchen', 'cashier']);
    if (access instanceof Response) return access;

    const db = admin();
    const { data: integration } = await db
      .from('ifood_integrations').select('*').eq('restaurant_id', restaurantId).maybeSingle();
    if (!integration?.enabled || !integration.merchant_id) {
      return json({ error: 'Integração com o iFood não está ativa.' }, 400);
    }

    const merchant = integration.merchant_id;

    if (open) {
      // Remove as pausas ativas para reabrir a loja
      const list = await ifoodFetch(`/merchant/v1.0/merchants/${merchant}/interruptions`, { method: 'GET' })
        .then(r => (Array.isArray(r.body) ? r.body : []) as Array<{ id: string }>)
        .catch(() => []);
      for (const i of list) {
        await ifoodFetch(`/merchant/v1.0/merchants/${merchant}/interruptions/${i.id}`, { method: 'DELETE' })
          .catch(() => null);
      }
    } else {
      const start = new Date();
      const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
      await ifoodFetch(`/merchant/v1.0/merchants/${merchant}/interruptions`, {
        method: 'POST',
        body: JSON.stringify({
          description: 'Loja fechada pelo sistema',
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });
    }

    await db.from('ifood_integrations')
      .update({ store_open: open, last_error: null }).eq('id', integration.id);

    return json({ ok: true, open });
  } catch (e) {
    if (credentialsError(e)) {
      return json({ error: 'Credenciais do iFood não configuradas.', code: 'credentials_missing' }, 400);
    }
    console.error('ifood-store-status erro:', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
