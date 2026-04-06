
# Sistema PDV para Restaurantes - Plano de Implementação

## Visão Geral
Sistema multi-tenant de PDV (Ponto de Venda) para restaurantes com 6 níveis de acesso: Super Admin (você, distribuidor), Admin do Restaurante, Garçom, Cozinha, Caixa e Financeiro. Inclui PWA para acesso mobile dos garçons e cozinha.

---

## 1. Estrutura de Dados (Lovable Cloud / Supabase)

### Tabelas principais:
- **restaurants** — nome, endereço, logo, status (ativo/bloqueado), plano de assinatura
- **user_roles** — vínculo usuário ↔ restaurante ↔ role (super_admin, admin, waiter, kitchen, cashier, finance)
- **tables** — número, capacidade, status (livre, ocupada, reservada), restaurant_id
- **reservations** — mesa, data/hora, nome do cliente, telefone, status
- **orders** — mesa, garçom, status (pendente, em preparo, pronto, entregue), timestamps
- **order_items** — pedido, produto, quantidade, observações, status individual
- **menu_items** — nome, descrição, preço, categoria, imagem, disponível (sim/não)
- **menu_categories** — categorias do cardápio
- **inventory** — produto, quantidade, unidade, estoque mínimo
- **inventory_movements** — entrada/saída, quantidade, motivo, data
- **cash_register** — abertura, fechamento, valor inicial, valor final, operador
- **cash_movements** — sangria, suprimento, valor, motivo, operador
- **payments** — pedido, método (dinheiro, cartão, pix), valor, troco

---

## 2. Portal Super Admin (Você - Distribuidor)

- **Dashboard** com total de restaurantes, ativos/bloqueados
- **Cadastro de restaurantes** com dados completos
- **Bloquear/desbloquear** restaurantes (restaurante bloqueado não consegue acessar)
- **Gerenciar assinaturas** — controle de planos e status de pagamento
- **Criar primeiro usuário admin** de cada restaurante

---

## 3. Portal Admin do Restaurante

- **Dashboard** com resumo de vendas, mesas ocupadas, pedidos em andamento
- **Cardápio** — CRUD de categorias e itens com preço e imagem
- **Mesas** — configurar quantidade e numeração de mesas
- **Gestão de Estoque** — cadastro de produtos, entrada/saída, alertas de estoque baixo
- **Reservas** — visualizar e gerenciar reservas
- **Usuários** — cadastrar garçons, cozinheiros, caixa e financeiro
- **Configurações** — dados do restaurante, logo, horários

---

## 4. Portal do Garçom (PWA otimizado para tablet/celular)

- **Mapa de mesas** visual — ver status (livre, ocupada, reservada)
- **Abrir mesa/comanda** — selecionar mesa e iniciar atendimento
- **Fazer pedidos** — navegar cardápio, adicionar itens com observações
- **Notificações em tempo real** — alerta sonoro + visual quando pedido fica pronto (via Supabase Realtime)
- **Fechar mesa** — enviar conta para o caixa
- **Ver reservas** do dia para controlar liberação de mesas

---

## 5. Portal da Cozinha (PWA para tela/tablet na cozinha)

- **Fila de pedidos** — lista em tempo real dos pedidos pendentes
- **Detalhes do pedido** — itens, quantidades, observações
- **Alterar status** — marcar item/pedido como "em preparo" → "pronto"
- **Notificação automática** ao garçom quando pedido fica pronto (Supabase Realtime)
- **Histórico** de pedidos do turno

---

## 6. Portal do Caixa

- **Abertura de caixa** — registrar valor inicial com relatório
- **Receber pagamentos** — selecionar mesa, escolher método (dinheiro, cartão, pix), calcular troco
- **Sangria** — retirada de dinheiro do caixa com motivo
- **Suprimento** — entrada de dinheiro no caixa com motivo
- **Fechamento de caixa** — relatório completo: total de vendas, por método de pagamento, sangrias, suprimentos, valor esperado vs real

---

## 7. Portal Financeiro

- **Dashboard financeiro** — receita, despesas, lucro líquido
- **Relatórios diários** — vendas por dia, ticket médio, itens mais vendidos
- **Relatórios semanais** — comparativo entre semanas, tendências
- **Relatórios mensais** — visão consolidada, gráficos de evolução
- **Controle de estoque** — relatório de movimentações, custos, produtos com baixo estoque
- **Exportar relatórios** em PDF/CSV

---

## 8. Sistema de Reservas

- **Criar reserva** — data, horário, mesa, nome e telefone do cliente
- **Mesa reservada** fica bloqueada no mapa — só libera para o dono da reserva
- **Notificação** quando horário da reserva se aproxima
- **Cancelamento** de reserva libera a mesa automaticamente

---

## 9. Funcionalidades Transversais

- **Autenticação** via Lovable Cloud (email/senha)
- **Tempo real** com Supabase Realtime para pedidos e notificações
- **PWA** para garçom e cozinha (instalável no celular/tablet)
- **RLS (Row Level Security)** — cada restaurante só vê seus próprios dados
- **Responsivo** — admin e financeiro otimizados para desktop; garçom e cozinha para mobile

---

## Ordem de Implementação

1. **Fase 1** — Auth + estrutura de banco + Super Admin + cadastro de restaurantes
2. **Fase 2** — Portal Admin (cardápio, mesas, usuários)
3. **Fase 3** — Portal Garçom (mapa de mesas, pedidos, comandas)
4. **Fase 4** — Portal Cozinha (fila de pedidos, status, notificações realtime)
5. **Fase 5** — Portal Caixa (pagamentos, sangria, abertura/fechamento)
6. **Fase 6** — Portal Financeiro (relatórios, dashboards)
7. **Fase 7** — Sistema de reservas + PWA setup
