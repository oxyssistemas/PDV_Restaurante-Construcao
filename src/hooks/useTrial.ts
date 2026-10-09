import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Teste grátis da loja atual (ou da matriz dela). null = cliente com plano, sem prazo. */
export function useTrial() {
  const { user, currentRole, isSuperAdmin } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ['my-trial', user?.id],
    enabled: !!user && !isSuperAdmin,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_trial_status');
      if (error) return [];
      return data ?? [];
    },
  });
  const trial = (data ?? []).find(t => t.restaurant_id === restaurantId) ?? null;
  return { trial, isLoading };
}
