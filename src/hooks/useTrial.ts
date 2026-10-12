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

export type TrialSuggestion = { used: string[]; plan: { code: string; name: string; price: number } | null };

/** O que a loja usou no teste e o menor plano que cobre esse uso. */
export function useTrialSuggestion(restaurantId: string | null | undefined) {
  return useQuery({
    queryKey: ['trial-suggestion', restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('trial_plan_suggestion', { _restaurant_id: restaurantId! });
      if (error) return null;
      return (data as unknown as TrialSuggestion | null) ?? null;
    },
  });
}

/** Planos ativos em ordem (do mais simples ao mais completo). */
export function usePlansList(enabled = true) {
  return useQuery({
    queryKey: ['plans-list'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('code, name, price_month, features, sort_order').eq('active', true).order('sort_order');
      return data ?? [];
    },
  });
}
