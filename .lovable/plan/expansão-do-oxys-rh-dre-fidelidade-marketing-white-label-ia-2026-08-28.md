# Expansão do Oxys: RH, DRE, Fidelidade, Marketing, White Label, IA e Planos

Cinco módulos novos + duas bases estruturais (planos e white label). Entrego em ordem, do mais simples ao mais complexo, tudo em português e dentro do padrão multi-restaurante já existente.

## 1. Módulo de RH (Financeiro + Gerência)

Nova aba "RH" em `/finance/hr` e `/admin/hr`.

- Cadastro de funcionários: nome, CPF, cargo, setor (cozinha, salão, caixa, entrega, admin), data de admissão/desligamento, tipo de contrato (CLT, PJ, diarista, extra), salário base, chave PIX, contato, observações.
- Vínculo opcional com o usuário de login já existente (para cruzar com pedidos lançados).
- Escalas/turnos: registro de jornada por dia com entrada/saída e cálculo de horas.
- Lançamentos de folha: salário, vale, adiantamento, hora extra, desconto, gorjeta — com status (pendente/pago) e integração com Contas a Pagar.
- Documentos e alertas: aniversário, vencimento de contrato/exame.
- Tudo registrado no log de auditoria já existente.

## 2. DRE (Demonstrativo de Resultado)

Nova aba "DRE" em `/finance/dre` e espelhada na gerência.

- Filtro por período (mês, trimestre, personalizado) com comparativo com período anterior.
- Estrutura: Receita bruta (vendas por canal: salão, delivery, balcão) → Deduções → Receita líquida → CMV (custo dos insumos consumidos, via estoque) → Lucro bruto → Despesas operacionais (folha de RH, contas a pagar por categoria) → EBITDA → Lucro líquido.
- Margem % em cada linha, gráfico de evolução mensal e exportação CSV/impressão.
- Categorias de despesa configuráveis por restaurante.

## 3. Programa de Fidelidade (opcional por restaurante)

Configurável pelo gerente em `/admin/loyalty`.

- Liga/desliga por restaurante.
- Modos: pontos por valor gasto (X pontos por R$1), cashback (% do valor), ou selos ("compre 10 leve 1").
- Regras configuráveis: validade dos pontos, valor mínimo, canais válidos (salão/delivery), multiplicadores por dia da semana ou categoria.
- Recompensas cadastráveis: item grátis, desconto fixo, desconto %, frete grátis.
- Identificação do cliente por telefone/CPF no caixa e no delivery; saldo, extrato e resgate na tela de pagamento.
- Painel com clientes mais fiéis, pontos emitidos e resgatados.

## 4. Portal de Marketing (base agora, aprofundamento depois)

Novo portal `/marketing` com layout próprio e papel `marketing`.

- Painel inicial com espaços para as integrações futuras.
- Tela de Conexões: cards para Instagram, Facebook, Google Meu Negócio, WhatsApp e TikTok — com estado (conectado/desconectado), botão de conectar e área para credenciais guardadas com segurança no backend.
- Estrutura de campanhas e publicações (rascunho) já criada no banco para evoluirmos depois.
- Acessível também pela gerência.

## 5. White Label (interface personalizável, sem acesso a código)

Editor visual em `/admin/branding`, liberado por permissão.

- Marca: nome do sistema, logo clara/escura, favicon, imagem de fundo do login.
- Cores: primária, secundária, destaque, fundo, texto — via seletor de cor, aplicadas nos tokens de tema (nunca cores fixas no código).
- Tipografia: escolha entre uma lista curada de fontes.
- Aparência: raio de borda, densidade (compacto/confortável), tema claro/escuro/automático.
- Textos: nome exibido nos portais, rodapé, mensagem do login, textos de recibo.
- Pré-visualização ao vivo e botão "restaurar padrão".
- O usuário só escolhe valores dentro de opções validadas — não há campo livre de CSS, HTML ou código. As configurações são carregadas no boot do app e aplicadas como variáveis de tema.

## 6. IA na Gerência

Assistente em `/admin/assistant`, usando a IA já disponível na plataforma (sem chave externa).

- Conversa em português com acesso somente aos dados do restaurante do usuário logado — nunca de outro restaurante, nunca ao código do sistema.
- Capacidades: responder perguntas sobre vendas, estoque, DRE, RH e fidelidade; gerar resumos e relatórios; sugerir ações (itens encalhados, insumos a repor, horários de pico).
- Ações de white label: pode propor mudanças de marca/cores/textos, que aparecem como sugestão e só são aplicadas após o gerente confirmar.
- Respostas em streaming, histórico de conversa por restaurante.
- Barreira de segurança: a IA opera por um conjunto fechado de ferramentas de leitura de dados, sem execução de SQL livre e sem qualquer acesso a arquivos do sistema.

## 7. Base para os 3 planos (só o terreno)

- Tabela de planos (Essencial, Profissional, Enterprise) com um mapa de funcionalidades liberadas por plano.
- Cada restaurante passa a ter um plano vinculado (todos começam com tudo liberado, para não quebrar nada hoje).
- Um "guarda de funcionalidade" no front: componente e hook que escondem menus e bloqueiam rotas conforme o plano, além de verificação no backend.
- Tela no Super Admin para editar o que cada plano libera — assim você define as regras depois, sem precisar de mudança de código.

## Detalhes técnicos

- Banco: novas tabelas `employees`, `employee_shifts`, `payroll_entries`, `dre_categories`, `loyalty_programs`, `loyalty_rewards`, `loyalty_accounts`, `loyalty_transactions`, `marketing_connections`, `marketing_campaigns`, `branding_settings`, `plans`, `plan_features`, `ai_conversations`, `ai_messages`. Todas com `restaurant_id`, RLS por restaurante, GRANTs explícitos e trigger de `updated_at`.
- Novos papéis no enum `app_role`: `hr`, `marketing`. Permissão de white label controlada por flag no perfil/roles, não por acesso a código.
- Frontend: novas rotas em `App.tsx`, itens de menu nos layouts Admin/Finance, novo `MarketingLayout`.
- White label: `BrandingProvider` que injeta variáveis CSS em `:root` a partir das configurações do restaurante; valores sempre sanitizados e restritos a formatos válidos.
- IA: edge function `restaurant-assistant` com validação de JWT, resolução do `restaurant_id` pelo token (nunca pelo corpo da requisição) e ferramentas de leitura pré-definidas.
- DRE e RH reaproveitam `src/lib/finance.ts` (formatação BRL e exportação CSV).

## Ordem de entrega

1. Base de planos + papéis
2. RH
3. DRE
4. Fidelidade
5. White label
6. Portal de Marketing (esqueleto)
7. IA da gerência
