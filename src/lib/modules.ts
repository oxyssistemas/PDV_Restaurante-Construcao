import { FeatureKey } from './plans';

/** Módulos com controle de permissão granular. A chave também é a funcionalidade do plano. */
export type ModuleKey = 'hr' | 'dre' | 'loyalty' | 'marketing' | 'branding' | 'ai';

export const moduleKeys: ModuleKey[] = ['hr', 'dre', 'loyalty', 'marketing', 'branding', 'ai'];

export const moduleLabels: Record<ModuleKey, string> = {
  hr: 'RH (funcionários, escalas e folha)',
  dre: 'DRE',
  loyalty: 'Programa de fidelidade',
  marketing: 'Marketing',
  branding: 'Identidade visual',
  ai: 'Assistente de IA',
};

export const moduleFeature = (m: ModuleKey): FeatureKey => m;

/** Espelha os padrões por cargo aplicados no banco (has_module_access). */
export function defaultModuleAccess(roles: string[], module: ModuleKey): { view: boolean; edit: boolean } {
  if (roles.includes('super_admin') || roles.includes('admin')) return { view: true, edit: true };
  if (roles.includes('finance') && ['hr', 'dre', 'loyalty'].includes(module)) return { view: true, edit: true };
  if (roles.includes('hr') && module === 'hr') return { view: true, edit: true };
  if (roles.includes('marketing') && module === 'marketing') return { view: true, edit: true };
  return { view: false, edit: false };
}
