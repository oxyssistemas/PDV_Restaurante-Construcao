export type FeatureKey =
  | 'orders' | 'tables' | 'menu' | 'kitchen' | 'cashier' | 'inventory'
  | 'reports' | 'hr' | 'dre' | 'loyalty' | 'marketing' | 'branding'
  | 'ai' | 'delivery' | 'fiscal' | 'crm';

export const featureLabels: Record<FeatureKey, string> = {
  orders: 'Pedidos e comandas',
  tables: 'Mapa de mesas',
  menu: 'Cardápio',
  kitchen: 'Portal da cozinha',
  cashier: 'Caixa',
  inventory: 'Estoque',
  reports: 'Relatórios financeiros',
  hr: 'Gestão de funcionários (RH)',
  dre: 'DRE',
  loyalty: 'Programa de fidelidade',
  marketing: 'Portal de marketing',
  branding: 'Personalização da interface (white label)',
  ai: 'Assistente de IA',
  delivery: 'Delivery e entregadores',
  fiscal: 'Emissão fiscal',
  crm: 'CRM',
};

export const featureKeys = Object.keys(featureLabels) as FeatureKey[];

/** Todas as funcionalidades liberadas — usado como padrão quando o plano não define nada. */
export const allFeaturesOn = (): Record<string, boolean> =>
  Object.fromEntries(featureKeys.map(k => [k, true]));

export const planLabels: Record<string, string> = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
};
