# 🍽️ SaaS PDV Restaurante

Sistema completo de **Ponto de Venda (PDV) e gestão para restaurantes**, desenvolvido para centralizar vendas, mesas, pedidos, cozinha, estoque, caixa e gestão financeira em uma única plataforma.

O objetivo do projeto é oferecer uma solução moderna, intuitiva e escalável para restaurantes, lanchonetes, bares, cafeterias e outros estabelecimentos do segmento alimentício.

---

## 🚀 Sobre o Projeto

O **SaaS PDV Restaurante** foi desenvolvido com uma arquitetura voltada para o modelo **Software as a Service (SaaS)**, permitindo que diferentes estabelecimentos utilizem a plataforma de forma independente e segura.

A plataforma busca simplificar a operação diária do restaurante, reduzindo processos manuais e proporcionando uma visão centralizada do negócio.

### 🎯 Principais objetivos

* Centralizar a operação do restaurante
* Facilitar o atendimento e lançamento de pedidos
* Organizar mesas e comandas
* Integrar pedidos com a cozinha
* Controlar estoque e produtos
* Gerenciar caixa e movimentações financeiras
* Disponibilizar indicadores para tomada de decisão
* Permitir gerenciamento através de um painel administrativo
* Criar uma plataforma preparada para múltiplos estabelecimentos

---

## ✨ Principais Funcionalidades

### 🖥️ PDV

* Abertura e fechamento de vendas
* Lançamento de produtos
* Aplicação de descontos
* Diferentes formas de pagamento
* Cancelamento de itens e pedidos
* Controle de caixa
* Histórico de vendas

### 🪑 Gestão de Mesas

* Visualização das mesas
* Status das mesas
* Abertura de comandas
* Adição de produtos
* Transferência de mesas
* Divisão de contas
* Fechamento da mesa

### 👨‍🍳 Cozinha

* Recebimento de pedidos
* Organização por status
* Acompanhamento do preparo
* Alteração de status do pedido
* Visualização dos itens e observações
* Separação entre pedidos pendentes, em preparo e finalizados

### 📱 Garçom

Sistema desenvolvido para facilitar o atendimento diretamente no salão.

* Visualização das mesas
* Abertura de pedidos
* Adição de produtos
* Observações nos pedidos
* Envio dos pedidos para a cozinha
* Acompanhamento das comandas

### 📦 Estoque

* Cadastro de produtos
* Controle de entradas e saídas
* Estoque mínimo
* Histórico de movimentações
* Controle de ingredientes
* Alertas de estoque baixo

### 💰 Financeiro

* Controle de entradas
* Controle de saídas
* Fluxo de caixa
* Contas a pagar
* Contas a receber
* Relatórios financeiros
* Fechamento de caixa

### 📊 Dashboard

Painel com informações importantes sobre o desempenho do estabelecimento.

* Faturamento
* Vendas realizadas
* Ticket médio
* Produtos mais vendidos
* Desempenho por período
* Formas de pagamento
* Indicadores financeiros

### 👑 Painel Administrativo

Área destinada ao gerenciamento completo do estabelecimento.

* Usuários
* Funcionários
* Produtos
* Categorias
* Mesas
* Configurações
* Permissões
* Relatórios
* Dados financeiros

---

## 🏢 Arquitetura SaaS

O projeto foi pensado para funcionar como uma plataforma **multi-tenant**, permitindo que diferentes restaurantes utilizem o mesmo sistema mantendo seus dados isolados.

### Estrutura conceitual

```text
SaaS
│
├── Restaurante A
│   ├── Usuários
│   ├── Produtos
│   ├── Mesas
│   ├── Pedidos
│   ├── Estoque
│   └── Financeiro
│
├── Restaurante B
│   ├── Usuários
│   ├── Produtos
│   ├── Mesas
│   ├── Pedidos
│   ├── Estoque
│   └── Financeiro
│
└── Master Admin
    ├── Restaurantes
    ├── Assinaturas
    ├── Planos
    ├── Usuários
    └── Monitoramento
```

---

## 🛠️ Tecnologias

O projeto utiliza tecnologias modernas para desenvolvimento de aplicações web.

### Front-end

* React
* TypeScript
* Vite
* Tailwind CSS
* Componentização de interface

### Back-end / Banco de Dados

* Supabase
* PostgreSQL
* Supabase Authentication
* Row Level Security (RLS)
* Supabase Storage

### Infraestrutura

* Vercel
* Git
* GitHub

> A stack pode evoluir conforme novas necessidades e integrações forem adicionadas ao projeto.

---

## 🔐 Segurança

A segurança é uma das prioridades do projeto.

Entre os recursos utilizados estão:

* Autenticação de usuários
* Controle de permissões
* Isolamento de dados entre restaurantes
* Row Level Security (RLS)
* Controle de acesso por função
* Proteção de dados sensíveis
* Estrutura preparada para ambientes multi-tenant

---

## 👥 Perfis de Usuário

O sistema pode trabalhar com diferentes níveis de acesso.

| Perfil           | Acesso                              |
| ---------------- | ----------------------------------- |
| 👑 Master Admin  | Gerenciamento global da plataforma  |
| 🏢 Administrador | Gestão completa do restaurante      |
| 💰 Caixa         | Operações financeiras e vendas      |
| 🧑‍🍳 Cozinha    | Gerenciamento dos pedidos           |
| 👨‍💼 Garçom     | Atendimento e lançamento de pedidos |
| 📊 Gerente       | Gestão e acompanhamento da operação |

---

## 💳 Modelo SaaS

A plataforma foi planejada para trabalhar com diferentes planos de assinatura.

### 🆓 Free

Plano destinado a testes e pequenos estabelecimentos.

### 🚀 Pro

Plano intermediário com recursos adicionais para restaurantes em crescimento.

### 💎 Premium

Plano completo com recursos avançados, relatórios, integrações e funcionalidades exclusivas.

A estrutura de planos pode ser alterada conforme a estratégia comercial do produto.

---

## 📈 Roadmap

### Concluído

* [x] Estrutura inicial do sistema
* [x] Autenticação
* [x] Dashboard
* [x] Cadastro de produtos
* [x] Gestão de usuários
* [x] Estrutura inicial do PDV

### Em desenvolvimento

* [x] Gestão completa de mesas
* [x] Sistema de comandas
* [x] Tela da cozinha
* [x] Aplicativo/interface do garçom
* [x] Controle de estoque
* [x] Gestão financeira
* [x] Relatórios avançados
* [x] Sistema de assinaturas

### Futuras implementações

* [ ] Integração com iFood
* [ ] Integração com plataformas de delivery
* [x] Emissão de documentos fiscais
* [ ] Integração com WhatsApp
* [x] Impressão de pedidos
* [ ] QR Code para cardápio
* [x] Pedido direto pelo cliente
* [x] Aplicativo mobile
* [ ] Programa de fidelidade
* [ ] Inteligência artificial para análise de vendas
* [ ] White Label

---

## 🖼️ Interface

O sistema possui uma interface desenvolvida com foco em:

* Simplicidade
* Velocidade
* Responsividade
* Facilidade de uso
* Experiência do usuário
* Operação em diferentes dispositivos

---

## 🎯 Público-Alvo

O SaaS foi pensado principalmente para:

* 🍽️ Restaurantes
* 🍔 Lanchonetes
* 🍕 Pizzarias
* 🍺 Bares
* ☕ Cafeterias
* 🥡 Deliverys
* 🍱 Food trucks
* 🏨 Estabelecimentos com operação de alimentação

---

## 📂 Estrutura do Projeto

```text
src/
│
├── components/
├── pages/
├── layouts/
├── hooks/
├── services/
├── contexts/
├── lib/
├── types/
└── utils/
```

A estrutura pode ser expandida conforme novos módulos forem incorporados ao sistema.

---

## ⚙️ Instalação

### 1. Clone o repositório

```bash
git clone SEU_REPOSITORIO
```

### 2. Acesse o projeto

```bash
cd seu-projeto
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Configure as variáveis de ambiente

Crie um arquivo `.env`:

```env
VITE_SUPABASE_URL=seu_supabase_url
VITE_SUPABASE_ANON_KEY=sua_supabase_anon_key
```

### 5. Execute o projeto

```bash
npm run dev
```

O projeto estará disponível localmente.

---

## 📌 Status do Projeto

🚧 **Em desenvolvimento**

O projeto está em constante evolução e novas funcionalidades, integrações e melhorias serão adicionadas ao longo do desenvolvimento.

---

## 🔮 Visão do Produto

A visão do projeto é transformar o sistema em uma plataforma completa de gestão para restaurantes, unificando:

**PDV + Mesas + Garçom + Cozinha + Estoque + Financeiro + Delivery + Gestão**

em uma única solução SaaS.

---

## 👨‍💻 Desenvolvimento

Projeto desenvolvido com foco em **desenvolvimento de software, arquitetura SaaS, aplicações web, banco de dados e gestão de negócios**.

---

## 📄 Licença

Este projeto possui código e funcionalidades proprietárias.

A utilização, distribuição ou comercialização do sistema depende da autorização do proprietário do projeto.
