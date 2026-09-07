import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  admin, credentialsError, ifoodFetch, json, requireRestaurantAccess,
} from '../_shared/ifood.ts';

type Action = 'accept' | 'reject' | 'ready' | 'dispatch' | 'conclude' | 'cancel';

const ACTIONS: Action[] = ['accept', 'reject', 'ready', 'dispatch', 'conclude', 'cancel'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
    const action = body?.action as Action;
    const ifoodOrderId = typeof body?.ifoodOrderId === 'string' ? body.ifoodOrderId : null;
    const orderId = typeof body?.orderId === 'string' ? body.orderId : null;
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 200) : null;

    if (!restaurantId || !ACTIONS.includes(action) || (!ifoodOrderId && !orderId)) {
      return json({ error: 'Requisição inválida' }, 400);
    }

    const access = await requireRestaurantAccess(req, restaurantId, ['admin', 'cashier', 'delivery', 'kitchen']);
    if (access instanceof Response) return access;

    const db = admin();
    let query = db.from('ifood_orders').select('*').eq('restaurant_id', restaurantId);
    query = ifoodOrderId ? query.eq('ifood_order_id', ifoodOrderId) : query.eq('order_id', orderId!);
    const { data: ifOrder } = await query.maybeSingle();
    if (!ifOrder) return json({ error: 'Pedido do iFood não encontrado', code: 'not_found' }, 404);

    const id = ifOrder.ifood_order_id;

    if (action === 'accept') {
      await ifoodFetch(`/order/v1.0/orders/${id}/confirm`, { method: 'POST' });

      let localOrderId = ifOrder.order_id as string | null;
      if (!localOrderId) {
        const payload = (ifOrder.payload || {}) as Record<string, any>;
        const { data: created, error: orderError } = await db.from('orders').insert({
          restaurant_id: restaurantId,
          order_type: 'delivery',
          status: 'pending',
          delivery_status: 'pending',
          source: 'ifood',
          customer_name: ifOrder.customer_name,
          customer_phone: ifOrder.customer_phone,
          customer_address: ifOrder.customer_address,
          delivery_fee: Number(payload?.total?.deliveryFee ?? 0),
          total: Number(ifOrder.total ?? 0),
          notes: `Pedido iFood #${ifOrder.display_id ?? id}`,
          created_by_name: 'iFood',
          created_by_role: 'delivery',
        }).select('id').single();
        if (orderError) throw new Error(orderError.message);
        localOrderId = created.id;

        // Itens: casa pelo código do iFood e, se não houver, pelo nome do produto.
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const { data: menu } = await db.from('menu_items')
          .select('id, name, ifood_product_id').eq('restaurant_id', restaurantId);
        const rows: Record<string, unknown>[] = [];
        for (const item of items) {
          const match = (menu || []).find((m: any) =>
            (item.id && m.ifood_product_id === item.id) ||
            (item.externalCode && m.ifood_product_id === item.externalCode) ||
            (m.name || '').toLowerCase() === String(item.name || '').toLowerCase());
          if (!match) continue;
          rows.push({
            order_id: localOrderId,
            menu_item_id: match.id,
            quantity: Number(item.quantity ?? 1),
            unit_price: Number(item.unitPrice ?? item.price ?? 0),
            notes: item.observations || null,
          });
        }
        if (rows.length) await db.from('order_items').insert(rows);
      }

      await db.from('ifood_orders').update({
        decision: 'accepted', ifood_status: 'CONFIRMED', order_id: localOrderId, last_error: null,
      }).eq('id', ifOrder.id);

      return json({ ok: true, orderId: localOrderId });
    }

    if (action === 'reject' || action === 'cancel') {
      await ifoodFetch(`/order/v1.0/orders/${id}/requestCancellation`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reason || 'PROBLEMAS DE SISTEMA',
          cancellationCode: body?.cancellationCode || '501',
        }),
      });
      await db.from('ifood_orders')
        .update({ decision: action === 'reject' ? 'rejected' : 'cancelled', ifood_status: 'CANCELLED' })
        .eq('id', ifOrder.id);
      if (ifOrder.order_id) {
        await db.from('orders')
          .update({ status: 'cancelled', delivery_status: 'cancelled' })
          .eq('id', ifOrder.order_id);
      }
      return json({ ok: true });
    }

    const path = action === 'ready'
      ? `/order/v1.0/orders/${id}/readyToPickup`
      : action === 'dispatch'
        ? `/order/v1.0/orders/${id}/dispatch`
        : `/order/v1.0/orders/${id}/dispatch`;

    await ifoodFetch(path, { method: 'POST' });
    await db.from('ifood_orders').update({
      ifood_status: action === 'ready' ? 'READY_TO_PICKUP' : 'DISPATCHED', last_error: null,
    }).eq('id', ifOrder.id);

    return json({ ok: true });
  } catch (e) {
    if (credentialsError(e)) {
      return json({ error: 'Credenciais do iFood não configuradas.', code: 'credentials_missing' }, 400);
    }
    console.error('ifood-order-action erro:', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
