import { FeatureKey } from './plans';
import { isAdminLike } from './roles';

/**
 * Funcionalidades com permissão de ver/editar por pessoa (tela Permissões).
 * hr, dre, loyalty, marketing, branding e ai também são conferidas no banco (has_module_access).
 */
export type ModuleKey =
  | 'dashboard' | 'network' | 'ai' | 'crm' | 'menu' | 'tables' | 'kiosks'
  | 'inventory' | 'stock_counts' | 'cmv' | 'reports' | 'history'
  | 'hr' | 'dre' | 'loyalty' | 'reviews' | 'fiscal' | 'accountant'
  | 'marketing' | 'delivery' | 'online_store' | 'whatsapp' | 'couriers' | 'ifood' | 'marketplaces'
  | 'branches' | 'users' | 'branding' | 'settings';

type ModuleDef = {
  label: string;
  group: string;
  /** Funcionalidade do plano que precisa estar liberada (sem: vale em todos os planos). */
  feature?: FeatureKey;
  /** Cargos que têm acesso total por padrão, além de admin, gerente e supervisor. */
  roles?: string[];
};

export const MODULES: Record<ModuleKey, ModuleDef> = {
  dashboard: { label: 'Dashboard e faturamento', group: 'Gestão', roles: ['finance'] },
  network: { label: 'Painel da rede (filiais)', group: 'Gestão', feature: 'branches' },
  ai: { label: 'Assistente de IA', group: 'Gestão', feature: 'ai' },
  reports: { label: 'Relatórios', group: 'Gestão', feature: 'reports', roles: ['finance'] },
  history: { label: 'Histórico de pedidos', group: 'Gestão', roles: ['finance'] },

  menu: { label: 'Cardápio', group: 'Operação', feature: 'menu' },
  tables: { label: 'Mesas e QR Code', group: 'Operação', feature: 'tables' },
  kiosks: { label: 'Autoatendimento (totem)', group: 'Operação' },
  inventory: { label: 'Estoque', group: 'Operação', feature: 'inventory', roles: ['finance'] },
  stock_counts: { label: 'Balanço de estoque', group: 'Operação', feature: 'inventory', roles: ['finance'] },
  cmv: { label: 'Custo do prato (CMV)', group: 'Operação', feature: 'inventory', roles: ['finance'] },

  crm: { label: 'CRM (clientes, fornecedores e contas a pagar)', group: 'Financeiro', feature: 'crm', roles: ['finance'] },
  dre: { label: 'DRE', group: 'Financeiro', feature: 'dre', roles: ['finance'] },
  fiscal: { label: 'Fiscal (NFC-e)', group: 'Financeiro', feature: 'fiscal', roles: ['finance'] },
  accountant: { label: 'Pacote do contador', group: 'Financeiro', feature: 'fiscal', roles: ['finance'] },
  hr: { label: 'RH (funcionários, escalas e folha)', group: 'Financeiro', feature: 'hr', roles: ['finance', 'hr'] },

  loyalty: { label: 'Programa de fidelidade e cashback', group: 'Clientes', feature: 'loyalty', roles: ['finance'] },
  reviews: { label: 'Avaliações (NPS)', group: 'Clientes', roles: ['finance'] },
  marketing: { label: 'Marketing', group: 'Clientes', feature: 'marketing', roles: ['marketing'] },

  delivery: { label: 'Pedidos de delivery (no admin: só acompanhar)', group: 'Delivery', feature: 'delivery', roles: ['delivery', 'cashier'] },
  online_store: { label: 'Loja online', group: 'Delivery', feature: 'delivery', roles: ['delivery'] },
  whatsapp: { label: 'WhatsApp', group: 'Delivery', feature: 'delivery', roles: ['delivery'] },
  couriers: { label: 'Entregadores', group: 'Delivery', feature: 'delivery' },
  ifood: { label: 'iFood', group: 'Delivery', feature: 'delivery', roles: ['delivery'] },
  marketplaces: { label: '99Food, Keeta e Rappi', group: 'Delivery', feature: 'delivery', roles: ['delivery'] },

  branches: { label: 'Filiais', group: 'Administração', feature: 'branches' },
  users: { label: 'Usuários', group: 'Administração' },
  branding: { label: 'Identidade visual', group: 'Administração', feature: 'branding' },
  settings: { label: 'Configurações (loja, taxa de serviço e impressoras)', group: 'Administração' },
};

export const moduleKeys = Object.keys(MODULES) as ModuleKey[];

export const moduleLabels = Object.fromEntries(moduleKeys.map(k => [k, MODULES[k].label])) as Record<ModuleKey, string>;

export const moduleGroups = Array.from(new Set(moduleKeys.map(k => MODULES[k].group)));

export const moduleFeature = (m: ModuleKey): FeatureKey | null => MODULES[m].feature ?? null;

/** Padrão por cargo, quando o admin não marcou nada para a pessoa (espelha has_module_access no banco). */
export function defaultModuleAccess(roles: string[], module: ModuleKey): { view: boolean; edit: boolean } {
  if (roles.includes('super_admin') || roles.some(isAdminLike)) return { view: true, edit: true };
  const allowed = MODULES[module].roles?.some(r => roles.includes(r)) ?? false;
  return { view: allowed, edit: allowed };
}

/** Telas do portal Financeiro (/finance). */
export const backOfficeModules: ModuleKey[] = [
  'dashboard', 'crm', 'dre', 'fiscal', 'hr', 'loyalty', 'reports', 'inventory', 'stock_counts', 'cmv',
  'reviews', 'accountant', 'history',
];

/** Telas do portal de delivery (/delivery). */
export const deliveryModules: ModuleKey[] = ['delivery', 'online_store', 'whatsapp', 'ifood'];

/**
 * Telas que a pessoa pode receber, de acordo com o portal do cargo dela.
 * Garçom, cozinha e entregador usam só a tela de operação do cargo; o caixa também tem a aba Delivery.
 */
export function modulesForRole(role: string): ModuleKey[] {
  if (isAdminLike(role)) return moduleKeys;
  if (role === 'finance' || role === 'hr') return backOfficeModules;
  if (role === 'marketing') return ['marketing'];
  if (role === 'delivery') return deliveryModules;
  if (role === 'cashier') return ['delivery'];
  return [];
}
