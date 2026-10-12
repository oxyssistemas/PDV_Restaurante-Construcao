import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';

/** Taxa de serviço e couvert da loja (configurados em Admin → Configurações). */
export type ServiceSettings = Tables<'service_settings'>;

export const defaultServiceSettings = (restaurantId: string): ServiceSettings => ({
  restaurant_id: restaurantId, service_enabled: false, service_percent: 10, service_on_delivery: false,
  couvert_enabled: false, couvert_amount: 0, couvert_label: 'Couvert artístico', updated_by: null, updated_at: '',
  min_consumption_enabled: false, min_consumption_amount: 0, waiter_commission_percent: 0, waiter_commission_base: 'service',
});

export function useServiceSettings(restaurantId?: string | null) {
  const { hasFeature } = usePlanFeatures();
  // fora do plano: taxa e couvert ficam desligados mesmo que estejam configurados
  const inPlan = hasFeature('service_fee');
  return useQuery({
    queryKey: ['service-settings', restaurantId, inPlan],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_settings').select('*').eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      const settings = data ?? defaultServiceSettings(restaurantId!);
      return inPlan ? settings : { ...settings, service_enabled: false, couvert_enabled: false, min_consumption_enabled: false };
    },
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Taxa de serviço sobre o consumo (itens). */
export const serviceFeeOf = (itemsTotal: number, s?: ServiceSettings | null) =>
  s?.service_enabled ? round2(itemsTotal * Number(s.service_percent) / 100) : 0;

/** Couvert = valor por pessoa × pessoas. */
export const couvertOf = (people: number, s?: ServiceSettings | null) =>
  s?.couvert_enabled ? round2(Math.max(0, people) * Number(s.couvert_amount)) : 0;

export const percentLabel = (v: number | string) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Consumação mínima: o que falta para chegar ao mínimo por pessoa (zero se já consumiu o mínimo). */
export const minConsumptionOf = (people: number, consumed: number, s?: ServiceSettings | null) =>
  s?.min_consumption_enabled ? round2(Math.max(0, Math.max(0, people) * Number(s.min_consumption_amount) - consumed)) : 0;
