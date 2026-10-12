/**
 * Conteúdo do Oxy (robô auxiliar): passeio de boas-vindas, dicas de cada tela e os treinamentos em PDF.
 * As dicas de cada tela também viram as seções dos PDFs, então o treinamento acompanha o sistema.
 */
export type OxyMood = 'idle' | 'talk' | 'wave' | 'point' | 'celebrate';

export type OxyStep = {
  title: string;
  text: string;
  /** Elemento da tela a destacar ([data-tour="..."]). Sem alvo: o balão fica no centro. */
  target?: string;
  mood?: OxyMood;
};

export type PortalKey = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'delivery' | 'finance' | 'courier' | 'marketing';

export type OxyTour = { id: string; portal: PortalKey; title: string; steps: OxyStep[] };

export const PORTALS: Record<PortalKey, { label: string; who: string; intro: string }> = {
  admin: {
    label: 'Administração', who: 'Dono, gerente e supervisor',
    intro: 'O portal do dono: cardápio, mesas, equipe, estoque, delivery, fiscal, relatórios e todas as configurações da loja.',
  },
  waiter: {
    label: 'Garçom', who: 'Garçons',
    intro: 'Mapa de mesas, abertura de comandas, rodízio, chamados das mesas, lançamento de pedidos direto para a cozinha e reservas.',
  },
  kitchen: {
    label: 'Cozinha', who: 'Cozinha e bar',
    intro: 'Quadro com os pedidos chegando em tempo real, separados por setor, do "novo" ao "pronto".',
  },
  cashier: {
    label: 'Caixa', who: 'Operadores de caixa',
    intro: 'Abertura e fechamento do caixa, recebimento das contas, pedidos de balcão, sangria, suprimento e delivery.',
  },
  delivery: {
    label: 'Delivery', who: 'Equipe de delivery',
    intro: 'Quadro dos pedidos de entrega e retirada de todos os canais, novo pedido por telefone, loja online e WhatsApp.',
  },
  finance: {
    label: 'Financeiro', who: 'Financeiro e RH',
    intro: 'Faturamento, contas a pagar, DRE, fiscal, estoque, custo do prato, RH e o pacote do contador.',
  },
  courier: {
    label: 'Entregador', who: 'Entregadores',
    intro: 'As entregas atribuídas a você, com endereço, contato do cliente e o botão para marcar como entregue.',
  },
  marketing: {
    label: 'Marketing', who: 'Marketing',
    intro: 'Publicação de fotos e vídeos no Instagram, Facebook e TikTok, campanhas e as contas conectadas.',
  },
};

/** Primeiro login do dono. */
export const WELCOME_ADMIN: OxyTour = {
  id: 'welcome-admin', portal: 'admin', title: 'Boas-vindas',
  steps: [
    { mood: 'wave', title: 'Oi! Eu sou o Oxy 👋', text: 'Sou o assistente da Oxys. Vou te mostrar rapidinho como o sistema funciona. Leva menos de um minuto.' },
    { mood: 'talk', title: 'O que é a Oxys', text: 'A Oxys junta tudo do restaurante num lugar só: salão, cozinha, caixa, delivery, estoque, fiscal e financeiro. Funciona no computador, no celular e até sem internet.' },
    { mood: 'point', target: 'sidebar', title: 'Menu de telas', text: 'Aqui ficam todas as telas. Passe o mouse para abrir o menu; ele recolhe sozinho quando você sai.' },
    { mood: 'point', target: 'trial-clock', title: 'Seu teste grátis', text: 'Este relógio mostra quanto tempo falta do seu teste. Clique nele para ver o plano ideal para o seu uso.' },
    { mood: 'point', target: 'notifications', title: 'Avisos', text: 'No sino chegam os avisos importantes: pedido novo, chamado de gerente, nota baixa na avaliação e mais.' },
    { mood: 'point', target: 'oxy', title: 'Estou sempre aqui', text: 'Em cada tela nova eu apareço para explicar. E se quiser me chamar de novo, é só clicar em mim aqui no canto.' },
    { mood: 'talk', title: 'Por onde começar', text: '1) Cadastre o cardápio. 2) Crie as mesas. 3) Cadastre a equipe em Usuários. 4) Abra o caixa e faça um pedido de teste.' },
    { mood: 'celebrate', title: 'Tudo pronto! 🎉', text: 'Também preparei treinamentos em PDF para você e para cada pessoa da equipe. Você encontra em "Treinamentos" quando clicar em mim.' },
  ],
};

/** Primeiro login de quem não é dono. */
export const WELCOME_STAFF: OxyTour = {
  id: 'welcome-staff', portal: 'admin', title: 'Boas-vindas',
  steps: [
    { mood: 'wave', title: 'Oi! Eu sou o Oxy 👋', text: 'Sou o assistente da Oxys. Vou te mostrar o que dá para fazer nesta tela.' },
    { mood: 'point', target: 'oxy', title: 'Precisa de ajuda?', text: 'Clique em mim aqui no canto a qualquer momento para rever as dicas ou baixar o treinamento do seu cargo.' },
  ],
};

const t = (id: string, portal: PortalKey, title: string, steps: [string, string][]): OxyTour => ({
  id, portal, title, steps: steps.map(([title, text], i) => ({ title, text, mood: i === 0 ? 'wave' : 'talk' })),
});

/** Dicas de cada tela (caminho exato). */
export const ROUTE_TOURS: Record<string, OxyTour> = {
  // ---------- administração ----------
  '/admin': t('admin-dashboard', 'admin', 'Dashboard', [
    ['Dashboard', 'Aqui você vê o dia da loja num relance: faturamento, mesas ocupadas, pedidos em andamento e os itens do cardápio.'],
    ['Evolução da semana', 'O gráfico mostra o faturamento dos últimos 7 dias, para comparar com a semana anterior.'],
  ]),
  '/admin/menu': t('admin-menu', 'admin', 'Cardápio', [
    ['Cardápio', 'Cadastre categorias e itens com foto, preço e setor da cozinha. O mesmo cardápio aparece para o garçom, no caixa, no QR da mesa, no totem e na loja online.'],
    ['Disponível', 'Use a chave "Disponível" para tirar um item do ar na hora, quando acabar.'],
    ['Custo e margem', 'Na aba Custo e margem você liga os insumos do estoque a cada prato (ficha técnica) e vê o custo, o CMV % e a margem.'],
    ['Opções e horários', 'No cadastro do prato monte Tamanhos (P/M/G), Sabores para meio a meio e Adicionais com mínimo e máximo. Em Horário de venda escolha dias e horas (ex.: almoço executivo de segunda a sexta).'],
    ['Rodízio', 'Na aba Rodízios crie o rodízio com o preço por pessoa e, no cadastro do prato, marque "Faz parte do rodízio". Fora do rodízio o prato tem o preço normal.'],
  ]),
  '/admin/tables': t('admin-tables', 'admin', 'Mesas', [
    ['Mesas', 'Crie as mesas do salão. Cada mesa tem um QR Code: o cliente lê com o celular, vê o cardápio e pede sozinho.'],
    ['QR Code', 'Clique em uma mesa para abrir, imprimir ou baixar o QR Code dela.'],
  ]),
  '/admin/kiosks': t('admin-kiosks', 'admin', 'Autoatendimento', [
    ['Totem', 'Crie um totem e abra o link num tablet no balcão. O cliente monta o pedido, recebe uma senha e paga no caixa.'],
  ]),
  '/admin/compras': t('admin-purchases', 'admin', 'Compras', [
    ['Nota do fornecedor', 'Envie o XML da NF-e: os itens entram no estoque com o custo da nota, o fornecedor é cadastrado e as parcelas vão para contas a pagar.'],
    ['Pedido de compra', 'Monte o pedido (ou use "Sugerir pelo estoque mínimo"), envie pelo WhatsApp e, quando chegar, toque em "Recebi".'],
  ]),
  '/admin/fila': t('admin-waitlist', 'admin', 'Fila de espera', [
    ['Fila de espera', 'Adicione quem chegou, chame pelo WhatsApp quando a mesa liberar e sente na mesa livre. O cliente também entra na fila pelo celular.'],
  ]),
  '/admin/inventory': t('admin-inventory', 'admin', 'Estoque', [
    ['Estoque', 'Cadastre os insumos com unidade e estoque mínimo. Lance entradas (compras) e saídas (perdas).'],
    ['Baixa automática', 'Quando o prato tem ficha técnica, cada venda já baixa os insumos sozinha.'],
  ]),
  '/admin/stock-counts': t('admin-stock-counts', 'admin', 'Balanço de estoque', [
    ['Balanço', 'Faça a contagem do estoque a qualquer hora ou agende toda semana ou todo mês.'],
    ['Diferenças', 'Toda diferença pede um motivo (perda, vencimento, erro...). No fim você ajusta o estoque e baixa o relatório em PDF ou Excel.'],
  ]),
  '/admin/fiscal': t('admin-fiscal', 'admin', 'Fiscal (NFC-e)', [
    ['Notas fiscais', 'Aqui ficam as NFC-e emitidas: reemitir, cancelar (até 30 minutos) e imprimir o DANFE.'],
    ['Configuração', 'Na aba Configuração você informa os dados da empresa, o certificado digital e os padrões fiscais dos itens.'],
  ]),
  '/admin/accountant': t('admin-accountant', 'admin', 'Pacote do contador', [
    ['Pacote do contador', 'Gere num clique o ZIP do mês com os XMLs das notas e os relatórios. Mande o link para o contador pelo WhatsApp ou email.'],
  ]),
  '/admin/crm': t('admin-crm', 'admin', 'CRM', [
    ['CRM', 'Clientes, fornecedores e contas a pagar num lugar só. O log mostra quem alterou o quê.'],
  ]),
  '/admin/hr': t('admin-hr', 'admin', 'RH', [
    ['RH', 'Cadastre os funcionários, monte as escalas e lance a folha de pagamento.'],
  ]),
  '/admin/dre': t('admin-dre', 'admin', 'DRE', [
    ['DRE', 'O demonstrativo do mês: receitas, custos e despesas, até o resultado final da loja.'],
  ]),
  '/admin/loyalty': t('admin-loyalty', 'admin', 'Fidelidade', [
    ['Fidelidade', 'Escolha entre pontos, cashback ou selos. O cliente acumula quando informa o telefone ao pagar.'],
    ['Cashback', 'Com cashback, o cliente usa o saldo como forma de pagamento no caixa e na loja online.'],
  ]),
  '/admin/promotions': t('admin-promotions', 'admin', 'Promoções', [
    ['Promoções', 'Happy hour dá % de desconto nos pratos escolhidos durante o horário; "leve X, pague Y" deixa os mais baratos de graça. Os dois entram sozinhos na conta, no salão, balcão e delivery.'],
    ['Cupons', 'Crie cupons com código para a loja online: % ou R$ de desconto, ou entrega grátis, com pedido mínimo e limite de usos.'],
  ]),
  '/admin/reviews': t('admin-reviews', 'admin', 'Avaliações', [
    ['Avaliações (NPS)', 'O recibo traz um QR para o cliente dar nota de 0 a 10. Aqui você vê o NPS, os comentários e responde cada um.'],
  ]),
  '/admin/history': t('admin-history', 'admin', 'Histórico', [
    ['Histórico', 'Todos os pedidos da loja, com filtros por data, origem e situação.'],
  ]),
  '/admin/delivery': t('admin-delivery', 'admin', 'Delivery', [
    ['Delivery', 'Todos os canais num lugar só: loja online, WhatsApp, iFood e apps. Use "Abrir tudo" ou "Fechar tudo", ou a chave de cada canal.'],
    ['Configurar cada canal', 'Os botões do topo abrem a configuração de cada canal e dos entregadores.'],
  ]),
  '/admin/delivery/loja': t('admin-online-store', 'admin', 'Loja online', [
    ['Loja online', 'Seu delivery próprio, sem comissão. Defina bairros e taxas, pedido mínimo, horários e a vitrine, e compartilhe o link.'],
  ]),
  '/admin/users': t('admin-users', 'admin', 'Usuários', [
    ['Usuários', 'Crie o acesso de cada pessoa da equipe com o cargo certo: garçom, cozinha, caixa, delivery, financeiro e outros.'],
    ['Cada um no seu portal', 'Cada cargo entra direto na tela dele e só vê o que precisa.'],
  ]),
  '/admin/permissions': t('admin-permissions', 'admin', 'Permissões', [
    ['Permissões', 'Escolha a pessoa e marque o que ela pode ver e o que pode editar em cada tela.'],
  ]),
  '/admin/branding': t('admin-branding', 'admin', 'Identidade visual', [
    ['Sua marca', 'Coloque logo, cores e nome próprios. Eles aparecem no sistema, na loja online e no recibo.'],
  ]),
  '/admin/settings': t('admin-settings', 'admin', 'Configurações', [
    ['Configurações', 'Dados da loja, taxa de serviço e couvert, e as impressoras de cada setor.'],
  ]),
  '/admin/branches': t('admin-branches', 'admin', 'Filiais', [
    ['Filiais', 'Crie filiais, defina gerentes e supervisores e envie o cardápio da matriz para todas com um clique.'],
  ]),
  '/admin/network': t('admin-network', 'admin', 'Painel da rede', [
    ['Painel da rede', 'Faturamento e pedidos de todas as lojas somados, com a comparação entre elas.'],
  ]),

  // ---------- garçom ----------
  '/waiter': t('waiter-tables', 'waiter', 'Mapa de mesas', [
    ['Mapa de mesas', 'Toque numa mesa livre para abrir a comanda ou numa ocupada para ver e lançar pedidos.'],
    ['Cores das mesas', 'A cor mostra a situação: livre, ocupada ou aguardando a conta.'],
    ['Chamados', 'Quando o cliente toca em "Chamar garçom" ou "Pedir a conta" no QR ou no tablet da mesa, aparece um aviso com som. Toque em "Estou indo" para avisar a equipe.'],
    ['Rodízio', 'Dentro da comanda, o botão Rodízio coloca a mesa no rodízio com adultos e crianças. Aí o QR e o tablet da mesa só mostram os pratos do rodízio.'],
  ]),
  '/waiter/orders': t('waiter-orders', 'waiter', 'Pedidos', [
    ['Pedidos', 'Acompanhe os pedidos das suas mesas e veja quando a cozinha marcar como pronto.'],
  ]),
  '/waiter/menu': t('waiter-menu', 'waiter', 'Cardápio', [
    ['Cardápio', 'Consulte preços, descrições e o que está disponível agora.'],
  ]),
  '/waiter/fila': t('waiter-waitlist', 'waiter', 'Fila de espera', [
    ['Fila de espera', 'Adicione quem chegou, toque em "Chamar" para avisar pelo WhatsApp e em "Sentar" para ocupar a mesa livre.'],
  ]),
  '/waiter/reservations': t('waiter-reservations', 'waiter', 'Reservas', [
    ['Reservas', 'Registre as reservas com nome, horário e número de pessoas.'],
  ]),

  // ---------- cozinha ----------
  '/kitchen': t('kitchen-queue', 'kitchen', 'Quadro da cozinha', [
    ['Quadro da cozinha', 'Os pedidos chegam aqui na hora, com observações. Toque para passar de "novo" para "preparando" e depois "pronto".'],
    ['Setores', 'Filtre pelo seu setor (cozinha, bar, sobremesa) para ver só o que é seu.'],
  ]),

  // ---------- caixa ----------
  '/cashier': t('cashier-register', 'cashier', 'Caixa', [
    ['Caixa', 'Comece o dia abrindo o caixa com o valor inicial. No fim do expediente, feche e confira os valores.'],
  ]),
  '/cashier/payments': t('cashier-payments', 'cashier', 'Pagamentos', [
    ['Receber a conta', 'Escolha a mesa ou pedido, confira taxa de serviço e couvert e receba em uma ou mais formas de pagamento.'],
    ['Fidelidade', 'Informe o telefone do cliente para ele acumular pontos ou cashback.'],
  ]),
  '/cashier/orders': t('cashier-orders', 'cashier', 'Lançar pedido', [
    ['Pedido de balcão', 'Lance pedidos para viagem ou de balcão. Eles vão direto para a cozinha.'],
  ]),
  '/cashier/movements': t('cashier-movements', 'cashier', 'Movimentações', [
    ['Sangria e suprimento', 'Registre retiradas (sangria) e reforços (suprimento) de dinheiro do caixa.'],
  ]),
  '/cashier/delivery': t('cashier-delivery', 'cashier', 'Delivery no caixa', [
    ['Delivery', 'Acompanhe os pedidos de entrega, atribua o entregador, registre o pagamento e avance cada pedido até entregue.'],
  ]),

  // ---------- delivery ----------
  '/delivery': t('delivery-orders', 'delivery', 'Pedidos de delivery', [
    ['Quadro de pedidos', 'Todos os pedidos de entrega e retirada, de todos os canais, do "aguardando" ao "entregue". Pedido novo toca um aviso.'],
    ['Entregador e pagamento', 'Em cada pedido você atribui o entregador e registra o pagamento.'],
  ]),
  '/delivery/new': t('delivery-new', 'delivery', 'Novo pedido', [
    ['Novo pedido', 'Pedido por telefone: escolha os itens, o bairro (a taxa entra sozinha) e a origem do pedido.'],
  ]),
  '/delivery/mapa': t('delivery-map', 'delivery', 'Mapa e rotas', [
    ['Mapa do delivery', 'Veja a loja, as entregas em aberto e onde está cada entregador (ele precisa estar com o app aberto e a localização liberada).'],
    ['Montar rota', 'No cartão do entregador, "Montar rota" põe as entregas na melhor ordem e abre todas as paradas no Google Maps.'],
  ]),
  '/delivery/loja': t('delivery-store', 'delivery', 'Loja online', [
    ['Loja online', 'Configure bairros, taxas, horários e a vitrine da sua loja online.'],
  ]),
  '/delivery/whatsapp': t('delivery-whatsapp', 'delivery', 'WhatsApp', [
    ['Robô de WhatsApp', 'O robô responde os clientes, manda o link da loja e avisa cada etapa do pedido. Você pode assumir a conversa a qualquer hora.'],
  ]),
  '/delivery/ifood': t('delivery-ifood', 'delivery', 'iFood', [
    ['iFood', 'Os pedidos do iFood chegam aqui para aceitar ou recusar. O status volta para o iFood sozinho.'],
  ]),

  // ---------- financeiro ----------
  '/finance': t('finance-dashboard', 'finance', 'Dashboard financeiro', [
    ['Financeiro', 'Receita, custo do estoque, lucro e ticket médio do mês, com as formas de pagamento.'],
  ]),
  '/finance/reports': t('finance-reports', 'finance', 'Relatórios', [
    ['Relatórios', 'Vendas por período, por item e por forma de pagamento, para baixar em planilha.'],
  ]),
  '/finance/crm': t('finance-crm', 'finance', 'CRM financeiro', [
    ['Contas a pagar', 'Cadastre fornecedores e contas a pagar e marque quando forem pagas.'],
  ]),
  '/finance/cmv': t('finance-cmv', 'finance', 'Custo do prato', [
    ['CMV', 'Custo de cada prato pela ficha técnica, CMV realizado e lucro bruto do período.'],
  ]),

  // ---------- entregador e marketing ----------
  '/courier': t('courier-deliveries', 'courier', 'Minhas entregas', [
    ['Minhas entregas', 'As entregas atribuídas a você, com endereço e telefone do cliente. Marque como entregue quando terminar.'],
  ]),
  '/marketing/whatsapp': t('marketing-whatsapp', 'marketing', 'WhatsApp em massa', [
    ['Campanhas', 'Escolha o público (sumidos, fiéis, aniversariantes…), escreva a mensagem e envie. Só entram clientes que aceitaram receber ofertas.'],
  ]),
  '/marketing': t('marketing-overview', 'marketing', 'Marketing', [
    ['Marketing', 'Publique fotos e vídeos no Instagram, Facebook e TikTok direto daqui e acompanhe os resultados.'],
    ['Conexões', 'Primeiro conecte as contas em Conexões; depois é só publicar.'],
  ]),
};

/** Mesmas dicas de algumas telas que existem em mais de um portal. */
const ALIASES: Record<string, string> = {
  '/finance/hr': '/admin/hr', '/finance/dre': '/admin/dre', '/finance/loyalty': '/admin/loyalty',
  '/finance/inventory': '/admin/inventory', '/finance/compras': '/admin/compras', '/finance/stock-counts': '/admin/stock-counts', '/finance/fiscal': '/admin/fiscal',
  '/finance/accountant': '/admin/accountant', '/finance/reviews': '/admin/reviews', '/finance/history': '/admin/history',
  '/admin/delivery/pedidos': '/delivery', '/cashier/delivery/new': '/delivery/new', '/admin/delivery/mapa': '/delivery/mapa',
};

export function tourForPath(path: string): OxyTour | null {
  const p = path.replace(/\/+$/, '') || '/';
  return ROUTE_TOURS[p] ?? (ALIASES[p] ? ROUTE_TOURS[ALIASES[p]] : null);
}

/** Portal pelo endereço. */
export function portalForPath(path: string): PortalKey | null {
  const first = path.split('/')[1];
  const map: Record<string, PortalKey> = {
    admin: 'admin', waiter: 'waiter', kitchen: 'kitchen', cashier: 'cashier', delivery: 'delivery',
    finance: 'finance', courier: 'courier', marketing: 'marketing',
  };
  return map[first] ?? null;
}

/** Dicas de um portal, na ordem do menu (para o PDF). */
export const toursOfPortal = (portal: PortalKey) => Object.values(ROUTE_TOURS).filter(t => t.portal === portal);
