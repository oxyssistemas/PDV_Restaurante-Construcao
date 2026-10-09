/**
 * Funções do sistema que o super admin liga ou desliga em cada plano (tela Planos).
 * Chave ausente no plano = liberada, para não bloquear restaurante por engano.
 * As chaves também são conferidas no banco e nas funções públicas (restaurant_has_feature).
 */
export type FeatureKey =
  // salão
  | 'orders' | 'tables' | 'menu' | 'kitchen' | 'cashier' | 'qr_menu' | 'reservations' | 'service_fee'
  | 'kiosk' | 'offline'
  // estoque e custos
  | 'inventory' | 'stock_counts' | 'cmv'
  // delivery
  | 'delivery' | 'online_store' | 'whatsapp' | 'ifood' | 'marketplaces'
  // financeiro e fiscal
  | 'fiscal' | 'accountant' | 'reports' | 'crm' | 'dre' | 'hr'
  // clientes
  | 'loyalty' | 'reviews' | 'marketing'
  // gestão
  | 'permissions' | 'ai' | 'branding' | 'branches';

type FeatureDef = { label: string; group: string; hint: string };

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  orders: { group: 'Salão', label: 'Pedidos e comandas', hint: 'Portal do garçom, comandas e pedidos de balcão.' },
  tables: { group: 'Salão', label: 'Mapa de mesas', hint: 'Mesas, ocupação e juntar/transferir.' },
  menu: { group: 'Salão', label: 'Cardápio', hint: 'Categorias, itens, fotos e adicionais.' },
  kitchen: { group: 'Salão', label: 'Cozinha (KDS) e setores', hint: 'Quadro da cozinha e vias por setor.' },
  cashier: { group: 'Salão', label: 'Caixa (PDV)', hint: 'Abertura, pagamentos, sangria e fechamento.' },
  qr_menu: { group: 'Salão', label: 'Cardápio QR na mesa', hint: 'Cliente lê o QR e pede sozinho.' },
  reservations: { group: 'Salão', label: 'Reservas', hint: 'Reservas de mesa pelo garçom.' },
  service_fee: { group: 'Salão', label: 'Taxa de serviço e couvert', hint: '10% e couvert por pessoa na conta.' },
  kiosk: { group: 'Salão', label: 'Autoatendimento (totem)', hint: 'Tablet/totem com senha do dia.' },
  offline: { group: 'Salão', label: 'Modo offline (central na loja)', hint: 'Continua vendendo sem internet.' },

  inventory: { group: 'Estoque e custos', label: 'Estoque e ficha técnica', hint: 'Entradas, saídas e baixa pela venda.' },
  stock_counts: { group: 'Estoque e custos', label: 'Balanço de estoque', hint: 'Contagem, motivos, PDF/Excel e agenda.' },
  cmv: { group: 'Estoque e custos', label: 'Custo do prato (CMV)', hint: 'Custo, CMV %, margem e lucro bruto.' },

  delivery: { group: 'Delivery', label: 'Delivery próprio', hint: 'Portal de delivery, quadro de pedidos e entregadores.' },
  online_store: { group: 'Delivery', label: 'Loja online própria', hint: 'Site de pedidos sem comissão (/pedir/loja).' },
  whatsapp: { group: 'Delivery', label: 'Robô de WhatsApp', hint: 'Atendimento automático e aviso de status.' },
  ifood: { group: 'Delivery', label: 'Integração iFood', hint: 'Pedidos, status, cardápio e loja aberta.' },
  marketplaces: { group: 'Delivery', label: '99Food, Keeta e Rappi', hint: 'Pedidos dos apps entram sozinhos.' },

  fiscal: { group: 'Financeiro e fiscal', label: 'Emissão de NFC-e', hint: 'Nota automática, cancelamento e DANFE.' },
  accountant: { group: 'Financeiro e fiscal', label: 'Pacote do contador', hint: 'ZIP mensal com XMLs e relatórios.' },
  reports: { group: 'Financeiro e fiscal', label: 'Relatórios financeiros', hint: 'Dashboard financeiro e relatórios.' },
  crm: { group: 'Financeiro e fiscal', label: 'CRM', hint: 'Clientes, fornecedores e contas a pagar.' },
  dre: { group: 'Financeiro e fiscal', label: 'DRE', hint: 'Demonstrativo de resultado do mês.' },
  hr: { group: 'Financeiro e fiscal', label: 'RH', hint: 'Funcionários, escalas e folha.' },

  loyalty: { group: 'Clientes', label: 'Fidelidade e cashback', hint: 'Pontos, cashback ou selos; cashback como pagamento.' },
  reviews: { group: 'Clientes', label: 'Avaliações (NPS)', hint: 'QR no recibo, painel de NPS e respostas.' },
  marketing: { group: 'Clientes', label: 'Marketing', hint: 'Publicar no Instagram, Facebook e TikTok.' },

  permissions: { group: 'Gestão', label: 'Permissões por pessoa', hint: 'Ver/editar por tela; sem isso vale o padrão do cargo.' },
  ai: { group: 'Gestão', label: 'Assistente de IA', hint: 'Perguntas sobre vendas, estoque e equipe.' },
  branding: { group: 'Gestão', label: 'Identidade visual (white label)', hint: 'Logo, cores e nome próprios.' },
  branches: { group: 'Gestão', label: 'Filiais e painel da rede', hint: 'Várias lojas, gerentes e supervisores.' },
};

export const featureKeys = Object.keys(FEATURES) as FeatureKey[];

export const featureLabels = Object.fromEntries(featureKeys.map(k => [k, FEATURES[k].label])) as Record<FeatureKey, string>;

export const featureGroups = Array.from(new Set(featureKeys.map(k => FEATURES[k].group)));

/** Todas as funcionalidades liberadas — usado como padrão quando o plano não define nada. */
export const allFeaturesOn = (): Record<string, boolean> =>
  Object.fromEntries(featureKeys.map(k => [k, true]));

export const planLabels: Record<string, string> = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
};

/**
 * Sugestão de mercado (out/2026). Concorrentes: Consumer R$ 59–270, Goomer R$ 60–300,
 * Anota AI R$ 220–330, Saipos a partir de R$ 241 (R$ 200–400 com módulos).
 * Cada plano inclui tudo do anterior.
 */
const ESSENCIAL: FeatureKey[] = [
  'orders', 'tables', 'menu', 'kitchen', 'cashier', 'qr_menu', 'reservations', 'service_fee',
  'offline', 'inventory', 'fiscal', 'reports',
];
const PROFISSIONAL: FeatureKey[] = [
  ...ESSENCIAL,
  'kiosk', 'stock_counts', 'cmv', 'delivery', 'online_store', 'whatsapp', 'ifood',
  'accountant', 'crm', 'dre', 'hr', 'loyalty', 'reviews', 'permissions',
];
const ENTERPRISE: FeatureKey[] = [...PROFISSIONAL, 'marketplaces', 'marketing', 'ai', 'branding', 'branches'];

const only = (on: FeatureKey[]) => Object.fromEntries(featureKeys.map(k => [k, on.includes(k)])) as Record<FeatureKey, boolean>;

export const PLAN_SUGGESTION: Record<string, { price: number; description: string; features: Record<FeatureKey, boolean> }> = {
  essencial: {
    price: 149,
    description: 'Salão completo: mesas, garçom, cozinha, caixa, QR na mesa, NFC-e, estoque e modo offline.',
    features: only(ESSENCIAL),
  },
  profissional: {
    price: 289,
    description: 'Tudo do Essencial + delivery próprio, loja online, iFood, WhatsApp, totem, fidelidade, NPS, CMV, balanço e financeiro completo.',
    features: only(PROFISSIONAL),
  },
  enterprise: {
    price: 549,
    description: 'Tudo do Profissional + filiais e painel da rede, 99Food/Keeta/Rappi, marketing, IA e marca própria. Filial adicional: R$ 199/mês.',
    features: only(ENTERPRISE),
  },
};
