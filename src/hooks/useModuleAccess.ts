import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { ModuleKey, defaultModuleAccess, moduleFeature } from '@/lib/modules';

/**
 * Permissões por módulo do usuário atual, combinando:
 * - funcionalidade liberada no plano do restaurante;
 * - permissão explícita em module_permissions (se existir);
 * - padrão do cargo (mesma regra aplicada nas políticas do banco).
 */
export function useModuleAccess() {
  const { user, roles, currentRole, isSuperAdmin } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const { hasFeature, planName, isLoading: planLoading } = usePlanFeatures();
  const roleNames = roles.map(r => r.role as string);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['module-permissions', user?.id, restaurantId],
    enabled: !!user?.id && !!restaurantId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_permissions')
        .select('module, can_view, can_edit')
        .eq('user_id', user!.id)
        .eq('restaurant_id', restaurantId!);
      if (error) throw error;
      const map: Record<string, { view: boolean; edit: boolean }> = {};
      (data || []).forEach(r => { map[r.module] = { view: r.can_view || r.can_edit, edit: r.can_edit }; });
      return map;
    },
  });

  const raw = (module: ModuleKey) => {
    if (isSuperAdmin) return { view: true, edit: true };
    const override = overrides?.[module];
    return override ?? defaultModuleAccess(roleNames, module);
  };

  const canView = (module: ModuleKey) =>
    hasFeature(moduleFeature(module)) && raw(module).view;

  const canEdit = (module: ModuleKey) =>
    hasFeature(moduleFeature(module)) && raw(module).edit;

  /** Bloqueado pelo plano (e não por falta de permissão). */
  const blockedByPlan = (module: ModuleKey) => !hasFeature(moduleFeature(module));

  return { canView, canEdit, blockedByPlan, planName, isLoading: isLoading || planLoading };
}
