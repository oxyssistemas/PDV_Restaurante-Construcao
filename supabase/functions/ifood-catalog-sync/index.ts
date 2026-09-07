import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  admin, credentialsError, ifoodFetch, json, requireRestaurantAccess,
} from '../_shared/ifood.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
    if (!restaurantId) return json({ error: 'Requisição inválida' }, 400);

    const access = await requireRestaurantAccess(req, restaurantId, ['admin']);
    if (access instanceof Response) return access;

    const db = admin();
    const { data: integration } = await db
      .from('ifood_integrations').select('*').eq('restaurant_id', restaurantId).maybeSingle();
    if (!integration?.enabled || !integration.merchant_id) {
      return json({ error: 'Integração com o iFood não está ativa.' }, 400);
    }
    if (!integration.sync_catalog) {
      return json({ error: 'A sincronização de cardápio está desligada nas configurações.' }, 400);
    }

    const { data: items } = await db.from('menu_items')
      .select('id, name, price, available, ifood_product_id')
      .eq('restaurant_id', restaurantId)
      .not('ifood_product_id', 'is', null);

    const linked = items || [];
    if (!linked.length) {
      return json({ error: 'Nenhum item do cardápio está vinculado a um produto do iFood.' }, 400);
    }

    const merchant = integration.merchant_id;
    let priceOk = 0, statusOk = 0;
    const failures: string[] = [];

    for (const item of linked) {
      try {
        await ifoodFetch(`/catalog/v2.0/merchants/${merchant}/items/price`, {
          method: 'PATCH',
          body: JSON.stringify({ item: { id: item.ifood_product_id, price: { value: Number(item.price) } } }),
        });
        priceOk++;
      } catch (e) {
        failures.push(`${item.name}: preço — ${e instanceof Error ? e.message : e}`);
      }
      try {
        await ifoodFetch(`/catalog/v2.0/merchants/${merchant}/items/status`, {
          method: 'PATCH',
          body: JSON.stringify({ item: { id: item.ifood_product_id, status: item.available ? 'AVAILABLE' : 'UNAVAILABLE' } }),
        });
        statusOk++;
      } catch (e) {
        failures.push(`${item.name}: disponibilidade — ${e instanceof Error ? e.message : e}`);
      }
    }

    await db.from('ifood_integrations').update({
      last_sync_at: new Date().toISOString(),
      last_error: failures.length ? failures.slice(0, 5).join(' | ') : null,
    }).eq('id', integration.id);

    return json({ total: linked.length, priceOk, statusOk, failures });
  } catch (e) {
    if (credentialsError(e)) {
      return json({ error: 'Credenciais do iFood não configuradas.', code: 'credentials_missing' }, 400);
    }
    console.error('ifood-catalog-sync erro:', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
