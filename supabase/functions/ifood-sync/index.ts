import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  admin, credentialsError, ifoodFetch, json, requireRestaurantAccess,
} from '../_shared/ifood.ts';

type IfoodEvent = { id: string; code: string; orderId: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
    if (!restaurantId) return json({ error: 'Requisição inválida' }, 400);

    const access = await requireRestaurantAccess(req, restaurantId, ['admin', 'cashier', 'delivery', 'kitchen']);
    if (access instanceof Response) return access;

    const db = admin();
    const { data: integration } = await db
      .from('ifood_integrations').select('*').eq('restaurant_id', restaurantId).maybeSingle();

    if (!integration || !integration.enabled || !integration.merchant_id) {
      return json({ error: 'Integração com o iFood não está ativa para este restaurante.' }, 400);
    }

    // 1. Busca eventos pendentes da loja
    const polling = await ifoodFetch('/order/v1.0/events:polling', {
      method: 'GET',
      headers: { 'x-polling-merchants': integration.merchant_id },
    });
    const events = (Array.isArray(polling.body) ? polling.body : []) as IfoodEvent[];

    let imported = 0;
    const seen = new Set<string>();

    for (const ev of events) {
      if (!ev?.id) continue;
      const { error: dupe } = await db.from('ifood_events').insert({
        restaurant_id: restaurantId,
        event_id: ev.id,
        code: ev.code,
        ifood_order_id: ev.orderId,
        payload: ev as unknown as Record<string, unknown>,
      });
      if (dupe) continue; // evento já processado

      if (!ev.orderId || seen.has(ev.orderId)) continue;
      seen.add(ev.orderId);

      // 2. Detalhes do pedido
      const detail = await ifoodFetch(`/order/v1.0/orders/${ev.orderId}`, { method: 'GET' })
        .then(r => r.body as Record<string, any>)
        .catch(() => null);
      if (!detail) continue;

      const address = detail?.delivery?.deliveryAddress;
      const addressText = address
        ? [address.formattedAddress, address.number, address.complement, address.neighborhood, address.city]
          .filter(Boolean).join(', ')
        : null;

      const record = {
        restaurant_id: restaurantId,
        ifood_order_id: ev.orderId,
        display_id: detail?.displayId ?? null,
        ifood_status: ev.code ?? null,
        customer_name: detail?.customer?.name ?? null,
        customer_phone: detail?.customer?.phone?.number ?? null,
        customer_address: addressText,
        total: Number(detail?.total?.orderAmount ?? 0),
        payload: detail,
      };

      const { data: existing } = await db
        .from('ifood_orders').select('id')
        .eq('restaurant_id', restaurantId).eq('ifood_order_id', ev.orderId).maybeSingle();

      if (existing) {
        await db.from('ifood_orders').update(record).eq('id', existing.id);
      } else {
        await db.from('ifood_orders').insert(record);
        imported++;
      }

      // Cancelamento vindo do iFood reflete no sistema
      if (ev.code === 'CAN' || ev.code === 'CANCELLED') {
        const { data: mapped } = await db
          .from('ifood_orders').select('id, order_id')
          .eq('restaurant_id', restaurantId).eq('ifood_order_id', ev.orderId).maybeSingle();
        if (mapped) {
          await db.from('ifood_orders').update({ decision: 'cancelled' }).eq('id', mapped.id);
          if (mapped.order_id) {
            await db.from('orders')
              .update({ status: 'cancelled', delivery_status: 'cancelled' })
              .eq('id', mapped.order_id);
          }
        }
      }
    }

    // 3. Confirma recebimento dos eventos
    if (events.length) {
      await ifoodFetch('/order/v1.0/events/acknowledgment', {
        method: 'POST',
        body: JSON.stringify(events.map(e => ({ id: e.id }))),
      }).catch(() => null);
    }

    await db.from('ifood_integrations')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    return json({ events: events.length, imported });
  } catch (e) {
    if (credentialsError(e)) {
      return json({ error: 'Credenciais do iFood não configuradas.', code: 'credentials_missing' }, 400);
    }
    console.error('ifood-sync erro:', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
