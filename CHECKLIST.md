# Checklist do Oxys Restaurante

Legenda: `[x]` pronto · `[~]` pronto no sistema, falta configuração/conta externa · `[ ]` a fazer

Atualizado a cada integração.

---

## 1. Base do sistema
- [x] Projeto fora da Lovable, rodando com Supabase próprio
- [x] Site publicado na Vercel (www.oxysrestaurante.app) com deploy automático pelo GitHub
- [x] Revisão de segurança do banco (permissões por restaurante, índices, funções protegidas)
- [x] Política de Privacidade e Termos de Uso
- [x] Planos e assinaturas por restaurante (super admin)

## 2. Portais
- [x] Super admin (restaurantes, planos)
- [x] Admin: painel, CRM, cardápio, mesas, estoque, usuários, permissões, entregadores, histórico, RH, DRE, fidelidade, identidade visual, assistente IA, configurações
- [x] Garçom (mesas, pedidos, cardápio, reservas)
- [x] Cozinha (quadro de pedidos responsivo, setores, impressão)
- [x] Caixa (pagamentos, pedidos, sangria/suprimento)
- [x] Financeiro (CRM, relatórios, estoque, histórico, RH, DRE, fidelidade)
- [x] Delivery (pedidos com origem, novo pedido, iFood, loja online, WhatsApp)
- [x] Entregador
- [x] Marketing (central de publicação, posts, conexões, campanhas)

## 3. Vendas e delivery
- [x] Cardápio por QR Code na mesa
- [x] Loja online própria (/pedir/nome-da-loja) com entrega por bairro, retirada e pagamento na entrega
- [x] Visual premium da loja (tema escuro, mobile como app)
- [x] Vitrine: banner, destaques e promoções escolhidos pela loja
- [x] Conta do cliente (cadastro/login para pedir, Meus pedidos, Meus dados)
- [x] Cliente da loja vai para o CRM automaticamente
- [x] Acompanhamento do pedido pelo cliente
- [x] Origem de cada pedido no portal Delivery (loja online, WhatsApp, iFood, 99Food, Keeta, Rappi, equipe)
- [x] Integração iFood (pedidos, status, cardápio, loja aberta/fechada)
- [~] Galeria de fotos de sugestão — falta subir as imagens em Storage → `store-media/sugestoes`
- [~] Robô de WhatsApp por restaurante — falta configurar o WhatsApp no app da Meta (webhook + revisão de permissões)

## 4. Fiscal
- [x] Motor de NFC-e com emissão automática após a venda, fila e reenvio
- [x] DANFE NFC-e na impressora térmica (com QR Code)
- [~] Emissão real — falta contratar o emissor (Focus NFe) e cadastrar o certificado de cada restaurante

## 5. Impressão
- [x] Fila central de impressão e cadastro de impressoras
- [x] Via da cozinha automática a cada pedido
- [x] Recibo ao fechar a conta
- [x] Estação de impressão no navegador
- [x] Agente local (impressoras de rede e USB)
- [x] Impressoras na nuvem: Star CloudPRNT e Epson Server Direct Print
- [x] Impressão silenciosa pelo app de computador, uma impressora por setor

## 6. Marketing
- [x] Publicar foto e vídeo no Instagram, Facebook e TikTok
- [~] Falta a aprovação dos apps pela Meta e pelo TikTok

## 7. Apps
- [x] App de computador: Windows, Mac e Linux, com atualização automática
- [x] App de celular Android e iOS (compilando no GitHub)
- [~] Publicar na Google Play — falta a conta (US$ 25) e a chave de assinatura
- [~] Publicar na App Store — falta a conta Apple Developer (US$ 99/ano)
- [~] Assinatura digital dos instaladores (tira avisos do Windows/Mac) — falta o certificado

## 8. Modo offline
- [x] Central no computador do caixa (ativação pelo administrador, PIN da equipe)
- [x] Sem internet: garçons, cozinha e caixa pela rede da loja (celular, tablet ou computador)
- [x] Lançar pedidos (mesa, balcão e delivery por telefone)
- [x] Cozinha recebendo e marcando os pedidos; via da cozinha impressa na central
- [x] Fechar conta e receber (várias formas, troco), recibo impresso e mesa liberada
- [x] Sincronização ao voltar a internet, na ordem, sem duplicar e sem reimprimir
- [x] Troca automática para o modo offline (todos os aparelhos e o computador da central) e volta automática quando a internet voltar
- [x] Cada pessoa cai na tela certa (cozinha, caixa, mesas); PIN lembrado por 30 dias em cada aparelho
- [~] NFC-e: emitida ao voltar a internet; contingência offline oficial (tpEmis 9) depende do emissor fiscal contratado

## 9. Configurações externas pendentes
- [~] Email próprio (SMTP, ex.: Resend) no Supabase — libera "Esqueci minha senha" dos clientes
- [~] Ligar a proteção contra senhas vazadas no Supabase (Auth → Password security)

---

## Próximas integrações
- [ ] Pix automático (QR dinâmico + baixa sozinha)
- [ ] Maquininha integrada (Stone, PagSeguro, Mercado Pago Point)
- [ ] 99Food, Keeta e Rappi automáticos (dependem de contrato de parceria)
- [ ] Ficha técnica e custo do prato (CMV)
- [ ] Taxa de serviço (10%) e couvert
- [ ] Várias lojas / franquias com painel único
- [ ] Recuperação de senha do cliente da loja (depois do SMTP)
- [ ] Autoatendimento (totem/tablet no balcão)
- [ ] Avaliação pós-pedido (NPS) e cashback
- [ ] Pacote para o contador (XMLs e relatórios fiscais)
- [ ] Permitir cadastrar como funcionário um email que já é cliente da loja

## Decisões em aberto
- [ ] Apagar a venda de teste "TESTE NFCE" (R$ 38) do restaurante Teste?
- [ ] Manter ou remover a vitrine de demonstração do restaurante Teste?
- [ ] Repositório do GitHub continua público? (a atualização automática do app de computador depende disso)
