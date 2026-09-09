import { supabase } from '@/integrations/supabase/client';
import { getFunctionError } from '@/lib/functionError';

export type IfoodAction = 'accept' | 'reject' | 'ready' | 'dispatch' | 'conclude' | 'cancel';

async function call(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(await getFunctionError(error));
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export const ifoodSync = (restaurantId: string) => call('ifood-sync', { restaurantId });

export const ifoodOrderAction = (
  restaurantId: string,
  action: IfoodAction,
  ids: { ifoodOrderId?: string; orderId?: string },
  reason?: string,
) => call('ifood-order-action', { restaurantId, action, reason, ...ids });

export const ifoodCatalogSync = (restaurantId: string) => call('ifood-catalog-sync', { restaurantId });

export const ifoodStoreStatus = (restaurantId: string, open: boolean) =>
  call('ifood-store-status', { restaurantId, open });

/**
 * Espelha no iFood a mudança de situação de um pedido do sistema.
 * Silencioso: pedidos que não vieram do iFood simplesmente não têm par lá.
 */
export async function pushIfoodStatus(
  restaurantId: string | null | undefined,
  orderId: string,
  deliveryStatus: string,
) {
  if (!restaurantId) return;
  const action: IfoodAction | null =
    deliveryStatus === 'preparing' ? null
      : deliveryStatus === 'out_for_delivery' ? 'dispatch'
        : deliveryStatus === 'delivered' ? 'conclude'
          : deliveryStatus === 'cancelled' ? 'cancel'
            : deliveryStatus === 'ready' ? 'ready' : null;
  if (!action) return;

  const { data } = await supabase
    .from('ifood_orders').select('id').eq('restaurant_id', restaurantId).eq('order_id', orderId).maybeSingle();
  if (!data) return;

  try {
    await ifoodOrderAction(restaurantId, action, { orderId });
  } catch (e) {
    console.error('Falha ao atualizar o pedido no iFood:', e);
  }
}
