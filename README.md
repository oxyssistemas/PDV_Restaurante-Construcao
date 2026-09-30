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

---

## ⚙️ Rodando o projeto

Requisitos: Node.js 18+ e npm.

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # gera a pasta dist/ para publicar
```

As variáveis do front ficam no `.env` (modelo em `.env.example`):

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave `anon` (pública) do projeto |
| `VITE_SUPABASE_PROJECT_ID` | ref do projeto |

## 🗄️ Supabase

- Migrações do banco: `supabase/migrations/`
- Edge Functions: `supabase/functions/` (deploy com `npx supabase functions deploy --project-ref <ref>`)

Segredos das Edge Functions (Supabase → Project Settings → Edge Functions → Secrets). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm automaticamente.

| Segredo | Usado por |
| --- | --- |
| `AI_API_KEY` | Assistente de IA (`restaurant-assistant`). Chave do Google AI Studio (Gemini) |
| `AI_API_URL` / `AI_MODEL` | Opcionais: outro provedor compatível com a API da OpenAI e o modelo |
| `IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET` | Integração iFood |
| `META_APP_ID` / `META_APP_SECRET` | Marketing (Facebook, Instagram, WhatsApp, Meta Ads) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Marketing (publicação no TikTok) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN` | Marketing (Google Meu Negócio e Google Ads) |
| `MARKETING_STATE_SECRET` | Opcional: assina o OAuth do marketing (sem ele, usa a service role) |
| `MEDIA_PROXY_BASE` | Opcional: endereço público das mídias (padrão `https://www.oxysrestaurante.app/media`) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook do WhatsApp |

## 📣 Central de publicação (marketing)

O portal de marketing publica no Instagram, Facebook e TikTok de uma vez, com foto, vídeo ou só texto, na hora ou agendado. O agendador roda a cada minuto pelo `pg_cron` do banco (função `marketing-scheduler`), sem configuração extra.

O endereço de retorno do login das redes (Redirect URI) é:

```
https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/marketing-oauth
```

**Meta (Facebook + Instagram)**
1. Crie um app do tipo "Empresa" em developers.facebook.com.
2. Adicione o produto "Login do Facebook para Empresas" e cadastre o Redirect URI acima.
3. Peça as permissões `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` e `instagram_content_publish`.
4. Cadastre `META_APP_ID` e `META_APP_SECRET` nos segredos do Supabase.
5. Enquanto o app estiver em modo de desenvolvimento, só quem tiver papel no app consegue conectar. Para os clientes usarem, a Meta exige verificação da empresa e revisão do app.

O Instagram precisa ser uma conta Profissional ligada a uma Página do Facebook.

**TikTok**
1. Crie um app em developers.tiktok.com com os produtos "Login Kit" e "Content Posting API" (ative o Direct Post).
2. Cadastre o Redirect URI acima e peça os escopos `user.info.basic` e `video.publish`.
3. Para postar fotos, verifique o domínio `oxysrestaurante.app` em "URL properties". O TikTok só busca fotos de domínios verificados. Vídeos não precisam disso.
4. Cadastre `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET` nos segredos do Supabase.
5. Até o TikTok aprovar (auditar) o app, os posts ficam visíveis só para o dono da conta.
