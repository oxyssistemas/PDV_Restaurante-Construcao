import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FeatureKey, allFeaturesOn } from '@/lib/plans';

/**
 * Carrega o plano do restaurante atual e o mapa de funcionalidades liberadas.
 * Enquanto carrega (ou quando não há plano definido) tudo fica liberado,
 * para não bloquear a operação por engano.
 */
export function usePlanFeatures() {
  const { currentRole, isSuperAdmin } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['plan-features', restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rest } = await supabase
        .from('restaurants').select('plan_code').eq('id', restaurantId!).maybeSingle();
      const code = rest?.plan_code || 'enterprise';
      const { data: plan } = await supabase
        .from('plans').select('code, name, features').eq('code', code).maybeSingle();
      return {
        code,
        name: plan?.name ?? code,
        features: (plan?.features as Record<string, boolean> | null) ?? allFeaturesOn(),
      };
    },
  });

  const features = data?.features ?? allFeaturesOn();

  const hasFeature = (key: FeatureKey) => {
    if (isSuperAdmin) return true;
    if (!restaurantId || isLoading || !data) return true;
    return features[key] !== false;
  };

  return { planCode: data?.code ?? null, planName: data?.name ?? null, features, hasFeature, isLoading };
}

export function useFeature(key: FeatureKey) {
  return usePlanFeatures().hasFeature(key);
}
