import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';

/** Loja em que a pessoa está agora (matriz ou filial) e se ela é a dona da rede (admin da matriz). */
export function useCurrentStore() {
  const { currentRole } = useAuth();
  const { hasFeature } = usePlanFeatures();
  const restaurantId = currentRole?.restaurant_id ?? null;

  const { data: store } = useQuery({
    queryKey: ['current-store', restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('restaurants').select('id, name, parent_id, branch_limit').eq('id', restaurantId!).maybeSingle();
      return data;
    },
  });

  const isBranch = !!store?.parent_id;
  // filiais: só o dono, na matriz, com o recurso no plano
  const canManageBranches = !!store && !isBranch && currentRole?.role === 'admin' && hasFeature('branches');
  return { store, isBranch, canManageBranches };
}
