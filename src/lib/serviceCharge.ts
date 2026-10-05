import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/** Taxa de serviço e couvert da loja (configurados em Admin → Configurações). */
export type ServiceSettings = Tables<'service_settings'>;

export const defaultServiceSettings = (restaurantId: string): ServiceSettings => ({
  restaurant_id: restaurantId, service_enabled: false, service_percent: 10, service_on_delivery: false,
  couvert_enabled: false, couvert_amount: 0, couvert_label: 'Couvert artístico', updated_by: null, updated_at: '',
});

export function useServiceSettings(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['service-settings', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_settings').select('*').eq('restaurant_id', restaurantId!).maybeSingle();
      if (error) throw error;
      return data ?? defaultServiceSettings(restaurantId!);
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
