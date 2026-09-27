# Portal de Marketing completo: redes sociais, WhatsApp e anúncios pagos

Cada restaurante conecta as próprias contas oficiais (Instagram, Facebook, WhatsApp Business, Google Meu Negócio, Meta Ads e Google Ads) e passa a cuidar de tudo pelo Oxys. Quem paga os anúncios é o próprio restaurante, com o cartão cadastrado na conta de anúncios dele.

Enquanto você não cria as contas de desenvolvedor, deixo o sistema inteiro pronto. Assim que as chaves chegarem, as conexões passam a funcionar sem nova construção.

## O que você precisa fazer (fora do sistema)

1. **Meta for Developers**: criar um app do tipo "Empresa", verificar a empresa no Meta Business e pedir a revisão das permissões de Instagram, Páginas, WhatsApp Business e Marketing API. Isso leva de 2 a 6 semanas.
2. **Google Cloud + Google Ads**: criar um projeto, ativar as APIs do Business Profile e do Google Ads, configurar a tela de consentimento e pedir o "developer token" do Google Ads (acesso básico).
3. Me enviar as chaves (App ID/Secret da Meta, Client ID/Secret do Google e o developer token). Eu guardo tudo de forma segura.

Na primeira entrega, envio esse passo a passo detalhado no chat.

## O que será construído

### 1. Conexões oficiais
- Em cada card, o botão "Conectar" leva o gerente ao login oficial da Meta ou do Google. Depois ele escolhe a página, o perfil, o número ou a conta de anúncios.
- Os acessos ficam guardados só no servidor e separados por restaurante. Nunca aparecem na tela.
- A tela mostra a situação de cada canal: conectado, expirado (com botão para reconectar) ou erro.
- Enquanto as chaves não existirem, os cards mostram "Aguardando liberação do Oxys".

### 2. Redes sociais (Instagram e Facebook)
- Criar publicação com texto e imagem, publicar na hora ou agendar.
- Calendário com as publicações agendadas e as já publicadas.
- Caixa de comentários com opção de responder pelo sistema.
- Métricas de cada publicação e do perfil: alcance, curtidas, comentários e seguidores.

### 3. Google Meu Negócio
- Ver e responder avaliações.
- Postar novidades e ofertas.
- Métricas de visualizações, ligações e rotas pedidas.

### 4. WhatsApp Business
- Caixa de conversas, parecida com a do WhatsApp Web, para responder clientes.
- Modelos de mensagem aprovados pela Meta, para enviar promoções.
- Disparo de campanhas para listas de clientes do CRM, apenas para quem aceitou receber mensagens.

### 5. Anúncios pagos (Meta Ads e Google Ads)
- Assistente de criação da campanha: objetivo, público (cidade/raio, idade), orçamento diário, período, imagem e texto.
- A campanha é criada **pausada**. O gerente revisa e só então ativa.
- Pausar, retomar e ajustar o orçamento pelo sistema.
- Painel de métricas: gasto, impressões, cliques, custo por clique e conversas iniciadas, com gráfico por dia e comparação entre campanhas.

### 6. Painel geral de Marketing
- Resumo com seguidores, alcance da semana, gasto com anúncios, mensagens não respondidas e avaliações novas.

## Ordem de entrega

1. Estrutura de conexões, guarda segura dos acessos e telas com o estado "aguardando liberação"
2. Instagram e Facebook (publicações, agenda, comentários e métricas)
3. WhatsApp (conversas, modelos e disparos)
4. Google Meu Negócio
5. Anúncios Meta e Google com o painel de métricas
6. Painel geral

## Detalhes técnicos

- Novas tabelas, todas com `restaurant_id`, RLS por `module_guard('marketing')`, GRANTs e `updated_at`: `marketing_accounts` (páginas, perfis e contas de anúncio escolhidos), `marketing_posts` (rascunho/agendado/publicado, id externo), `marketing_post_metrics`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_templates`, `ad_campaigns` (plataforma, id externo, status, orçamento), `ad_metrics_daily`, `customers.marketing_opt_in`.
- Os tokens ficam em `marketing_credentials`, sem GRANT para `anon`/`authenticated` e acessíveis só pela service role nas Edge Functions.
- Edge Functions: `marketing-oauth-start` e `marketing-oauth-callback` (state assinado com restaurant_id + usuário), `meta-publish`, `meta-insights`, `meta-ads`, `google-business`, `google-ads`, `whatsapp-send`, `whatsapp-webhook` (público, com verificação de assinatura) e `marketing-scheduler` (cron via pg_cron, que publica os agendados e sincroniza as métricas diariamente).
- Secrets: `META_APP_ID`, `META_APP_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` e `MARKETING_STATE_SECRET` (gerado).
- Os conectores prontos do Lovable (WhatsApp e Google Ads) usam uma única conta, a do dono do workspace. Por isso não servem quando cada restaurante precisa da própria conta. Nesse caso é preciso um OAuth próprio por restaurante.
- Todo o recurso fica atrás da funcionalidade `marketing` do plano e das permissões por módulo que já existem.
