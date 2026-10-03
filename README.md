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
| `FISCAL_PROVIDER` | Emissor de NFC-e da plataforma: `simulado` (padrão, só testes) ou `focus` |
| `FOCUS_NFE_TOKEN` | Token de revenda da Focus NFe (cadastra os restaurantes como empresas) |
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

## 🧾 NFC-e (nota fiscal de consumidor)

- O restaurante preenche a configuração fiscal (Configurações → Configuração fiscal) e liga "Emitir NFC-e neste restaurante" e, se quiser, "Emitir automaticamente ao quitar o pedido".
- Quando a conta é quitada, o banco cria a nota e chama a função `fiscal`, que emite em segundo plano (o caixa não espera). Falhas de conexão são repetidas sozinhas; rejeições da SEFAZ aparecem em CRM → Notas fiscais com o motivo, para corrigir e "Tentar de novo".
- Com a nota autorizada, o DANFE vai para as impressoras marcadas com "Nota fiscal".
- Emissor: `FISCAL_PROVIDER=simulado` gera notas fictícias em homologação para testar o fluxo. Para produção, contrate a Focus NFe, cadastre `FISCAL_PROVIDER=focus` e `FOCUS_NFE_TOKEN`, e em cada restaurante clique em "Enviar ao emissor" com a senha do certificado A1.

## 🖨️ Impressão

- Cadastro em Configurações → Impressoras: o que cada impressora imprime (cozinha, comanda, recibo, nota) e se imprime sozinha.
- Pedidos novos geram a via da cozinha e contas quitadas geram o recibo direto no banco, então funciona de qualquer aparelho (garçom no celular, QR Code, iFood).
- No computador ligado à impressora, abra "Estação de impressão" e marque as impressoras dele. Para não aparecer a janela de impressão, abra o Chrome com `--kiosk-printing` (passo a passo na própria tela).
- Agente local (`public/agente/`, baixado pelo restaurante em Configurações → Impressoras): roda com Node.js em qualquer PC da casa e manda ESC/POS direto para impressoras de rede (IP:9100) ou instaladas no Windows/Linux/Mac, sem janela. Usa a função `print-agent` com a chave gerada pelo admin. Os cupons em ESC/POS são montados no servidor (`supabase/functions/_shared/receipt.ts`).
- Impressoras nuvem, sem computador: Star CloudPRNT (StarPRNT, com texto puro como reserva) e Epson Server Direct Print (ePOS-Print XML), pela função `cloud-print`. Cada impressora tem um link secreto (botão "Link" na lista de impressoras) que é configurado na página da própria impressora.

## 🛵 Delivery próprio, WhatsApp e apps de entrega

Todos os pedidos de entrega e retirada caem no **portal Delivery → Pedidos**, cada um com uma bolinha que mostra de onde veio:

| Bolinha | Origem | Como entra |
| --- | --- | --- |
| 🌐 azul | Loja online | Cliente pede pelo link `www.oxysrestaurante.app/pedir/<loja>` |
| 💬 verde | WhatsApp | Cliente pede pelo link que o robô manda (ou a equipe lança como "WhatsApp") |
| iF vermelha | iFood | Integração automática (portal Delivery → iFood) |
| 99 / K / R | 99Food, Keeta, Rappi | Lançado pela equipe em "Novo Pedido" escolhendo a origem |
| 🎧 cinza | Equipe / telefone | Lançado pela equipe |

Pedido novo que não foi lançado pela equipe toca um bipe e mostra um aviso na tela de pedidos. A via da cozinha sai sozinha como nos outros pedidos.

### Loja online (portal Delivery → Loja online)
- Endereço próprio (`/pedir/nome-da-loja`), QR Code para panfletos e botão para abrir/fechar na hora.
- Entrega com taxa por bairro (ou taxa única), retirada no local, pedido mínimo e tempo estimado.
- Pagamento na entrega/retirada (dinheiro com troco, cartão ou Pix); o pagamento é registrado na tela de pedidos como antes.
- Preço, taxa e total são calculados no servidor (função `delivery-store` + `create_online_order`), nunca no navegador do cliente.
- O cliente acompanha o pedido em uma página própria e o cadastro dele entra no CRM pelo telefone.

### Vitrine da loja (portal Delivery → Loja online)
- **Banner principal:** título, parte em destaque (vermelho), descrição e foto. Sem foto escolhida, a loja usa a foto de um prato.
- **Destaques do cardápio:** a loja escolhe até 8 pratos e a ordem. Sem destaques, a seção não aparece.
- **Promoções:** banners com título, texto, foto e o prato da promoção. O preço exibido e o botão "Aproveitar agora" usam o prato do cardápio (o cliente paga exatamente o que vê). Para combo com preço especial, cadastre o combo no cardápio.
- **Fotos:** a loja envia a própria (vai para `store-media/<id do restaurante>/`, reduzida para até 1440 px) ou escolhe na galeria de **sugestões**.

**Como colocar fotos na galeria de sugestões:** no painel do Supabase → Storage → bucket `store-media` → pasta `sugestoes` → Upload. Aceita JPG, PNG ou WEBP até 5 MB (de preferência horizontais, 1600×900). Subpastas viram grupos na galeria (ex.: `sugestoes/pizzas`, `sugestoes/hamburgueres`). Todas as lojas veem as mesmas sugestões; só a Oxys (painel do Supabase) consegue adicionar ou apagar.

### Conta do cliente na loja online
- Para enviar o pedido o cliente **entra ou cria conta** (nome, WhatsApp, email e senha). A conta vale para todas as lojas Oxys.
- A conta é criada já confirmada pelo servidor (`delivery-store` → `signup`), sem email de confirmação: o envio de emails padrão do Supabase só chega para membros da equipe do projeto.
- Ao criar conta, entrar ou pedir, a ficha do cliente é criada/atualizada no **CRM da loja** (nome, WhatsApp, email, endereço, etiqueta "loja online"). Se já existia uma ficha com o mesmo telefone, ela é ligada à conta.
- O cliente vê **Meus pedidos** (com acompanhamento) e **Meus dados** pelo botão Entrar/conta (no celular: Pedidos e Perfil na barra de baixo).
- A sessão do cliente fica separada da equipe (`storeClient`, chave `oxys-store-auth`): no mesmo computador o caixa continua logado no sistema.
- Clientes não têm papel em `user_roles`, então não acessam nenhum portal da equipe.
- "Esqueci minha senha" depende de um servidor de email próprio (SMTP) configurado no Supabase; até lá, a loja orienta pelo WhatsApp.

### Robô de WhatsApp (portal Delivery → WhatsApp)
Cada restaurante usa o próprio número do WhatsApp Business:
1. O administrador conecta a conta Meta do restaurante em **Marketing → Conexões** (a mesma do Instagram/Facebook).
2. Em **Delivery → WhatsApp → Robô e número**, escolhe o número e liga o robô.

O robô responde com um menu (fazer pedido pelo link da loja, acompanhar pedido, horário e endereço, falar com atendente), avisa cada mudança de status do pedido e, quando o cliente pede um atendente, pausa e marca a conversa para a equipe responder pela aba **Conversas**.

A Meta só deixa mandar mensagem livre até 24 h depois da última mensagem do cliente. Por isso a página do pedido tem o botão **"Receber avisos pelo WhatsApp"**: o cliente manda o código do pedido e passa a receber os avisos.

**Configuração única no app da Meta (Oxys):** produto WhatsApp adicionado, webhook `https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/whatsapp-webhook` com o token do segredo `WHATSAPP_VERIFY_TOKEN`, campo `messages` assinado, e as permissões `whatsapp_business_messaging` e `whatsapp_business_management` aprovadas na revisão do app.

## 📴 Modo offline (sem internet)

O **app de computador do caixa** vira a *central* da loja (`desktop/hub/`):

- **Ativar:** no app de computador, logado como administrador → **Estação de impressão → Central do modo offline** → *Ativar este computador*. A chave é gerada pela função `offline-hub` e fica só neste computador.
- **Com internet:** a central fica sempre em dia (aviso em tempo real a cada mudança + cópia a cada 20 s): é um **espelho do banco da loja** (`offline_replica`: pedidos, itens, pagamentos, mesas, cardápio, caixa, reservas, entregadores, impressoras e a equipe com seus papéis).
- **Sem internet, nada muda na operação:** em ~10 s sem resposta da nuvem cada aparelho passa **na hora, sozinho**, para a central (`http://IP-da-central:8790`), **na mesma tela e com a mesma pessoa logada**. O computador da central também troca sozinho. Um aviso no canto diz "Sem internet" e o que fica para depois.
  - A central responde como a nuvem: `/rest/v1` (formato PostgREST, `desktop/hub/mirror.cjs` e `postgrest.cjs`), `/auth/v1` (`auth.cjs`) e tempo real `/realtime/v1` (`realtime.cjs`). O app detecta a central pela meta `oxys-central` (`src/lib/central.ts`).
  - **Mesmas permissões:** as regras de acesso do banco (RLS) estão reproduzidas em `desktop/hub/policies.cjs` — cada pessoa vê e altera exatamente o que veria na nuvem, inclusive nos avisos em tempo real. Ao mudar uma política no banco, atualize esse arquivo.
  - **Login de sempre:** a sessão da nuvem é levada na troca (a central confere o token com a chave pública da nuvem) e renovada pela central. Quem estava deslogado entra com o email e a senha normais: a central recebe o hash bcrypt das senhas da equipe (nunca a senha) e guarda num cofre separado, criptografado pelo sistema operacional (`desktop/hub/credentials.cjs`). Na volta da internet essa pessoa recebe uma sessão da nuvem e continua logada.
  - Cada gravação vira uma linha na fila (`row.insert/update/delete`), aplicada na nuvem por `offline_apply_row`. O que depende da internet (NFC-e na hora, iFood, WhatsApp, loja online, envio de arquivos) mostra "disponível quando a internet voltar".
- **Volta automática:** quando a central já enviou tudo e o aparelho alcança a nuvem, ele volta na hora para a mesma tela na nuvem, logado.
- **Impressão sem internet:** a via da cozinha e o recibo (as mesmas regras do banco, refeitas na central) saem nas impressoras do computador da central, escolhidas na Estação de impressão.
- **Quando a internet volta:** a central envia tudo na ordem em que aconteceu (`apply_offline_ops`, sem duplicar se reenviar). Na nuvem, a via da cozinha e o recibo não são impressos de novo; a baixa de estoque e a **NFC-e acontecem nesse momento**.
- Dados locais: `oxys-central.json` e `oxys-central-config.json` na pasta de dados do app. No Windows, permita o acesso à rede quando o firewall perguntar.
- Teste sem derrubar a internet: abrir o app com `OXYS_FORCE_OFFLINE=1`.

**NFC-e em contingência:** hoje a nota é emitida assim que a internet volta. A contingência offline oficial da SEFAZ (nota assinada na hora, sem internet) depende do emissor fiscal contratado e do certificado na central.

## 🖥️ Servidor dedicado por loja (recurso contratado)

Para lojas que contratam: os dados da operação daquela loja ficam num **servidor instalado no computador da loja** ("Oxys Servidor"), não na nuvem compartilhada. A nuvem guarda só o controle: restaurante, plano, equipe/login e o endereço do servidor.

- **Liberar (super admin):** Restaurantes → **Servidor** (ou marque "Servidor dedicado" ao cadastrar a loja) → ligar "Recurso contratado" → **Gerar código de instalação** (vale 24 h, uso único).
- **Instalar:** baixe o *Oxys Servidor* (Windows, Linux ou Mac, na mesma página de Releases do app), abra e digite o código. O servidor copia todo o histórico da loja (`dedicated_export`), avisa a nuvem e passa a atender. Abre sozinho com o computador e fica na bandeja.
- **Equipe:** entra normalmente por oxysrestaurante.app; depois do login é levada na hora para o servidor da loja, na mesma tela e já logada (`DedicatedGate`). Pode entrar direto no servidor com email e senha de sempre, inclusive sem internet. Sem internet, os aparelhos usam o endereço da rede da loja.
- **Mesmas regras da nuvem:** as permissões vêm direto do banco (`pg_policies`) e são aplicadas por um tradutor (`desktop/hub/rls.cjs`) — conferido com 5.565 verificações sem diferença. Os gatilhos do banco também (via da cozinha, recibo, baixa de estoque pela ficha técnica, aviso de estoque baixo, reserva de mesa).
- **O que continua na nuvem:** dados do restaurante, plano e equipe — gravados na nuvem em nome da própria pessoa (com as regras da nuvem), a partir do servidor.
- **Acesso pela internet:** túnel seguro da Cloudflare (`cloudflared`, vem no instalador), sem abrir portas no roteador: automático (`*.trycloudflare.com`) ou endereço fixo com token do túnel.
- **Supabase próprio (opcional):** no painel do servidor, informe o endereço e a chave service_role do projeto da loja; o servidor mantém lá uma cópia de todos os dados, atualizada a cada mudança (fila no SQLite). O projeto precisa ter a estrutura do sistema (aplicar `supabase/migrations`).
- **Cópias de segurança:** uma por dia (guarda 7), mais "Fazer cópia agora" no painel.
- **Depois de conferir:** super admin → Servidor → **Apagar da nuvem** (digitando o nome da loja) remove os dados da operação da nuvem compartilhada.
- Arquivos: `desktop/server-main.cjs` (app), `desktop/servidor.html` (painel), `desktop/hub/dedicated.cjs` (servidor), `store.cjs` (SQLite), `tunnel.cjs`, `ownsupabase.cjs`, função `dedicated-server`, migrações `20261004000000_dedicated_servers.sql` e `…000100_dedicated_primary_keys.sql`. Instaladores: `desktop/electron-builder.server.json` (gerados no mesmo workflow do app de computador).
- **Ainda não no servidor dedicado** (aparece "ainda não disponível no servidor dedicado"): loja online/cardápio QR, robô de WhatsApp, iFood, emissão de NFC-e, assistente de IA, marketing e envio de fotos.

## 💻📱 Apps de computador e celular

| Versão | Onde está | Como é feita |
| --- | --- | --- |
| Web (nuvem) | https://www.oxysrestaurante.app | Vercel, a cada push |
| Windows, Mac e Linux | Releases do GitHub (`Oxys-Restaurante-Setup.exe`, `Oxys-Restaurante-Mac.dmg`, `Oxys-Restaurante-Linux.deb` / `.AppImage`) | `desktop/` (Electron), workflow **App de computador** |
| Android e iOS | Play Store / App Store | Capacitor (`android/`, `ios/`), workflow **App de celular** |

### App de computador (`desktop/`)

Abre o sistema online, então está sempre atualizado sem reinstalar. Além do navegador, ele:

- imprime os cupons **direto na impressora, sem janela** (Estação de impressão → escolha a impressora do computador para cada setor);
- abre junto com o computador (opção na Estação de impressão), com atalho na área de trabalho;
- mostra uma tela própria quando a internet cai e volta sozinho;
- se atualiza sozinho pelas Releases do GitHub (por isso o repositório precisa continuar **público**; se ficar privado, troque o `publish` em `desktop/package.json` por um servidor próprio).

Testar localmente: `cd desktop && npm install && npm start` (use `OXYS_URL=http://localhost:8080 npm start` para abrir o servidor local).

**Lançar uma versão:** `git tag v1.0.1 && git push origin v1.0.1`. O GitHub gera o `.exe`, o `.dmg`, o `.deb` e o `.AppImage`, publica em Releases e os apps instalados se atualizam (no Linux, a atualização automática vale para o `.AppImage`; o `.deb` se atualiza instalando a versão nova).

Sem certificado de assinatura digital:
- **Windows** mostra "O Windows protegeu o computador" na primeira instalação → *Mais informações* → *Executar assim mesmo*. Para remover o aviso, compre um certificado de assinatura de código e salve `WIN_CERTIFICATE_PFX` (base64) e `WIN_CERTIFICATE_PASSWORD` nos segredos do GitHub.
- **Mac** bloqueia na primeira abertura → Ajustes do Sistema → Privacidade e Segurança → *Abrir mesmo assim*. Atualização automática no Mac só funciona com app assinado: com a conta Apple Developer, salve `MAC_CERTIFICATE_P12`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`.

**Linux (Ubuntu/Debian):** `sudo apt install ./Oxys-Restaurante-Linux.deb`. Outras distribuições: dê permissão de execução ao `.AppImage` e abra (precisa do pacote `libfuse2`).

### App de celular (Capacitor)

O app leva o sistema completo dentro dele (todos os portais). Comandos:

```bash
npm run mobile:sync      # compila e copia para android/ e ios/
npm run mobile:android   # abre no Android Studio
npm run mobile:ios       # abre no Xcode (só no Mac)
```

Ícones e tela de abertura: `python3 desktop/build/make-icons.py && npm run mobile:assets`.

No celular:
- links de QR Code das mesas e o retorno do login das redes sociais usam o endereço público do site;
- conectar Instagram/Facebook/TikTok abre o navegador do celular; ao voltar ao app, a tela de Conexões atualiza;
- a impressão automática fica com a estação no computador, o agente local ou as impressoras nuvem (Star/Epson), porque o celular não imprime sem confirmação.

**GitHub Actions:** em *Settings → Secrets and variables → Actions → Variables*, crie `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (mesmos valores do `.env`). Cada versão gera um APK de teste (baixe em Actions → execução → Artifacts) e confere que o iOS compila.

### Publicar nas lojas (checklist)

**Google Play** (conta de desenvolvedor: US$ 25, pagamento único)
1. Gere a chave de assinatura uma única vez e guarde em local seguro (se perder, não dá para atualizar o app):
   `keytool -genkeypair -v -keystore oxys.jks -alias oxys -keyalg RSA -keysize 2048 -validity 10000`
2. Segredos no GitHub: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 oxys.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`oxys`), `ANDROID_KEY_PASSWORD`. O workflow passa a gerar o `.aab` assinado.
3. No Play Console: crie o app `app.oxysrestaurante`, envie o `.aab` em *Teste interno*, preencha a ficha (ícone 512 px em `resources/icon-only.png`, capturas de tela, descrição), a *Segurança dos dados*, a classificação de conteúdo e a política de privacidade `https://www.oxysrestaurante.app/privacidade`.
4. Contas pessoais novas precisam de um teste fechado com 12 testadores por 14 dias antes de publicar para todos.

**App Store** (Apple Developer: US$ 99/ano; precisa de um Mac ou do workflow com certificados)
1. No App Store Connect crie o app com o identificador `app.oxysrestaurante`.
2. No Xcode (`npm run mobile:ios`): selecione o time em *Signing & Capabilities*, depois *Product → Archive → Distribute App*.
3. Informe uma conta de demonstração para a revisão da Apple (usuário e senha de um restaurante de teste) e a URL de privacidade.
4. Atenção à regra 4.2 da Apple (apps que são "só um site"): o app tem o sistema embutido, botão voltar, tela de abertura e funciona como ferramenta de trabalho, mas na descrição destaque os portais (garçom, cozinha, caixa) para a revisão.
