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
- [x] Teste grátis de 14 dias (/cadastro): cadastro sozinho com tudo liberado, relógio no admin, botão para o WhatsApp da Oxys, bloqueio automático no fim (telas, banco, central e servidor), um teste por CPF/CNPJ e por WhatsApp, etiquetas de plano no menu durante o teste, sugestão do plano ideal pelo uso (no relógio, na tela de bloqueio e na mensagem do WhatsApp) e controles no super admin (+7 dias / liberar plano)
- [x] Planos com as 31 funções do sistema, liga/desliga por plano (por função ou grupo), preço e descrição editáveis e "Aplicar sugestão de mercado"; o plano vale nas telas, na loja online, QR da mesa, totem, avaliação, iFood, WhatsApp, 99Food/Keeta/Rappi, NFC-e, pacote do contador, central offline e servidor dedicado; filiais seguem o plano da matriz
- [ ] Definir os preços finais e aplicar a sugestão de planos (Essencial R$ 149, Profissional R$ 289, Enterprise R$ 549 + R$ 199 por filial)

## 2. Portais
- [x] Super admin (restaurantes, planos)
- [x] Admin: painel, CRM, cardápio, mesas, estoque, usuários, permissões, entregadores, histórico, RH, DRE, fidelidade, identidade visual, configurações
- [x] Garçom (mesas, pedidos, cardápio, reservas)
- [x] Cozinha (quadro de pedidos responsivo, setores, impressão)
- [x] Caixa (pagamentos, pedidos, sangria/suprimento e aba Delivery: quadro dos pedidos, entregador, pagamento e novo pedido)
- [x] Financeiro (CRM, relatórios, estoque, histórico, RH, DRE, fidelidade)
- [x] Delivery como portal independente, só da equipe de delivery (pedidos com origem, novo pedido, iFood, loja online, WhatsApp)
- [x] Aba única Delivery no admin: visão geral com todos os canais (abrir/fechar cada um ou "Abrir tudo"/"Fechar tudo", pedidos e vendas do dia) e botões no topo para configurar cada canal (pedidos só para ver, loja online, WhatsApp, iFood, 99Food, Keeta, Rappi e entregadores)
- [x] Entregador
- [x] Marketing (central de publicação, posts, conexões, campanhas)
- [x] Menu lateral recolhido (só ícones) que abre ao passar o mouse e rebate sozinho, em todos os portais
- [x] Oxy, o robô chef assistente (SVG animado): recebe no cadastro, passeio de boas-vindas no primeiro login com destaque das partes da tela, dica na primeira vez em cada tela de todos os portais, botão no canto para chamar de novo e treinamentos em PDF (geral e por portal) gerados pelo sistema
- [x] Seletor de tema claro/escuro no rodapé do menu (fica salvo no aparelho); com white label vale o tema e as cores da identidade visual
- [x] Permissões de ver/editar por pessoa em todas as telas do sistema (agrupadas, com "liberar tudo", "só ver", "bloquear" e "voltar ao padrão do cargo"); quem só pode ver abre a tela com os botões de gravar travados

## 3. Vendas e delivery
- [x] Cardápio por QR Code na mesa
- [x] Rodízio: cadastro de rodízios (preço adulto/criança) e "Faz parte do rodízio" no prato; garçom põe a mesa no rodízio pela comanda (cobrança por pessoa entra sozinha e não vai para a cozinha); QR/tablet da mesa só mostram os pratos do rodízio como "Incluso" e barram o resto; fora do rodízio os pratos têm preço normal; mesa liberada sai do rodízio (também na central offline)
- [x] Opções do prato: tamanhos (P/M/G), sabores meio a meio (até 4, preço do mais caro ou média, proporcional ao tamanho), adicionais/montagem com mínimo e máximo; escolha no garçom, caixa, delivery, QR, totem e loja online; preço conferido no banco; opções na cozinha, impressão e conta (também na central offline)
- [x] Promoções (Admin → Promoções): happy hour (% em pratos/categorias por dia e horário), "leve X, pague Y" (os mais baratos saem de graça) — automáticos no salão, balcão/totem e delivery, calculados no banco pelo horário de cada item; cupons da loja online (% , R$ ou entrega grátis, pedido mínimo, limite de usos e por cliente); desconto aparece no caixa, recibo, NFC-e, delivery, acompanhamento e na sacola; selos nos cardápios públicos; também na central offline
- [x] Taxa de entrega por distância (km): base + km inclusos + valor por km extra + raio máximo; endereço vira coordenada no servidor (OpenStreetMap: Nominatim com Photon de reserva, com cache); na loja online e no pedido por telefone ("Calcular pela distância"); também no servidor dedicado
- [x] Mapa do delivery (Delivery → Mapa e rotas e Admin → Delivery → Mapa e rotas): loja, entregas em aberto e entregadores em tempo real (o app do entregador envia a localização enquanto está na rua); "Localizar endereços" para pedidos sem coordenada
- [x] Roteirização: "Montar rota" ordena as entregas do entregador (sai da loja e vai sempre para a mais perto), mostra a ordem no app do entregador e abre a rota com todas as paradas no Google Maps
- [~] Entrega terceirizada: registro do parceiro (Lalamove, Loggi, Uber Direct, 99 Entrega, iFood Envios…), custo e link de rastreio no pedido; chamar a corrida automaticamente pela API depende de contrato com cada parceiro
- [x] Comanda individual por cartão/pulseira: nº na abertura (único entre as comandas abertas), busca pelo nº no mapa de mesas e no caixa (seleciona só aquela comanda); também na central offline
- [x] Consumação mínima por pessoa (Admin → Configurações): o caixa cobra o complemento; entra no recibo, na NFC-e e no fechamento
- [x] Dividir a conta no caixa: partes iguais por pessoa ou pelos itens escolhidos (taxas na mesma proporção)
- [x] Comissão do garçom (% sobre a taxa de serviço ou sobre as vendas) e relatório por garçom
- [x] Fila de espera (Garçom → Fila de espera): adicionar, chamar pelo WhatsApp, sentar na mesa livre; cliente entra pelo celular e acompanha a posição em /fila/<código>; também na central offline
- [x] Reserva online (/reservar/<endereço>, configurada em Admin → Configurações): dias e horários, duração, antecedência, tamanho do grupo; a mesa livre é escolhida sozinha sem conflito; aviso para o admin e o garçom; também no servidor dedicado
- [x] Relatórios de gestão: comparativo com o período anterior (faturamento, pedidos, ticket, por canal, descontos), garçons e comissão, mapa de calor de horários e planilha de vendas para o contador
- [x] Balança (quilo/self-service): prato "vendido por quilo" com preço do kg; garçom e caixa pesam digitando (kg ou gramas) ou lendo a balança serial/USB (Toledo, Filizola, Urano pelo app de computador/Chrome); peso no item, na cozinha e na NFC-e em KG; fora do QR/totem/loja online
- [x] Compras (Admin/Financeiro → Compras): importar o XML da NF-e do fornecedor (itens ligados ao estoque com fator de conversão, custo médio, fornecedor cadastrado pelo CNPJ, parcelas em contas a pagar, nota repetida bloqueada, lembra o item da última nota)
- [x] Pedido de compra: itens, sugestão pelo estoque mínimo, envio pelo WhatsApp do fornecedor, "Recebi" dá entrada no estoque
- [x] Transferência de estoque entre lojas da rede (sai de uma, entra na outra, registrado nas duas)
- [x] Curva ABC dos pratos por faturamento (Relatórios → Gestão do período)
- [x] Contas a receber (CRM): eventos, convênios e vendas a prazo, vencidas em destaque, CSV
- [~] Boleto e Pix das contas a receber pelo Asaas (Admin → Configurações: chave da conta Asaas + endereço do aviso de pagamento para baixa automática) — precisa da conta Asaas do cliente
- [x] Fluxo de caixa projetado (30/60/90 dias): saldo de hoje + cartões que ainda vão cair (taxa e prazo da maquininha) + contas a receber − contas a pagar, gráfico e alerta de saldo negativo
- [x] Extrato bancário OFX e conciliação: sugere conta a pagar, conta a receber ou repasse da maquininha; dá baixa ao conciliar; saldo do extrato vira o saldo do fluxo
- [~] Open Finance (extrato automático): depende de contrato com empresa autorizada pelo Banco Central (Pluggy, Belvo)
- [x] Campanhas de WhatsApp (Marketing → WhatsApp em massa): público por segmento (sumidos há X dias, ativos, nº de pedidos, quanto gastou, canal, aniversariantes) só com clientes que aceitaram ofertas (LGPD); envio assistido (abre cada conversa com a mensagem pronta) ou automático pelo WhatsApp oficial
- [~] Envio automático das campanhas: precisa do WhatsApp Business conectado e de um modelo de mensagem aprovado pela Meta
- [x] Convite para avaliar no Google: quem dá nota alta no NPS vê o botão "Avaliar no Google" (link e nota mínima em Avaliações → Configurações); também no servidor dedicado
- [x] Horário de venda por prato (dias e faixa de horário): some do QR, totem, loja e listas fora do horário
- [x] Botão "Chamar garçom" e "Pedir a conta" no QR/tablet da mesa com pop-up e som no app do garçom ("Estou indo" some para todos)
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
- [x] Módulo Fiscal no menu (admin e financeiro): notas emitidas, cancelamento, reemissão e configuração fiscal num lugar só
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
- [x] Central no computador do caixa (ativação pelo administrador)
- [x] Sem internet com as MESMAS telas de sempre (garçom, cozinha, caixa, delivery), pela central na rede da loja
- [x] Mesmas permissões da nuvem por cargo (regras do banco reproduzidas na central, inclusive no tempo real)
- [x] Troca automática e imediata para a central e de volta, na mesma tela e sem novo login
- [x] Atualização em tempo real entre os aparelhos também sem internet
- [x] Via da cozinha e recibo impressos na central; sem reimprimir na volta
- [x] Central sempre em dia com a nuvem (aviso em tempo real a cada mudança, ~1 s)
- [x] Sincronização ao voltar a internet, na ordem, sem duplicar
- [x] Avisos claros do que depende da internet (NFC-e na hora, iFood, WhatsApp, loja online)
- [x] Entrar do zero sem internet com email e senha normais (senhas só em hash, num cofre criptografado na central) e voltar para a nuvem já logado
- [x] Versão v1.0.4 publicada (app de computador com as mesmas telas offline)
- [ ] Testar o modo offline numa loja real
- [~] NFC-e: emitida ao voltar a internet; contingência offline oficial (tpEmis 9) depende do emissor fiscal contratado

## 10. Servidor dedicado por loja (contratado)
- [x] Super admin escolhe quem tem o recurso (na lista de restaurantes e no cadastro da loja)
- [x] Código de instalação (24 h, uso único) e acompanhamento: situação, último contato, endereços, migração
- [x] "Oxys Servidor" instalável (Windows, Linux, Mac): banco próprio da loja (SQLite), abre com o computador, fica na bandeja, imprime as vias
- [x] Migração de todo o histórico da loja da nuvem para o servidor
- [x] Equipe entra por oxysrestaurante.app e vai sozinha para o servidor da loja (mesma tela, já logada); login normal também sem internet
- [x] Mesmas permissões da nuvem lidas direto do banco (tradutor automático das regras) e os mesmos gatilhos (estoque, impressão, reserva)
- [x] Dados do restaurante e equipe continuam na nuvem, gravados em nome da própria pessoa
- [x] Acesso pela internet por túnel seguro (automático ou endereço fixo), sem abrir portas
- [x] Opção de Supabase próprio e exclusivo da loja (cópia de todos os dados, atualizada a cada mudança)
- [x] Cópias de segurança diárias (7 últimas) e manual
- [x] Apagar os dados da loja da nuvem compartilhada depois de conferido
- [x] Versão v1.0.4 publicada com os instaladores do Oxys Servidor (Windows, Linux, Mac)
- [x] Versão v1.0.6: app lembra o servidor da loja; servidor com loja online, QR, totem, avaliação, cashback e fotos; central com balanço e totem offline
- [x] Versão v1.0.7: módulo Fiscal no menu, permissões de ver/editar em todas as telas, menu lateral que recolhe sozinho, delivery como portal independente, aba Delivery no caixa e aba única Delivery no admin
- [x] Versão v1.0.8: planos com todas as funções do sistema (liga/desliga por plano, preço e sugestão de mercado) valendo também nas telas públicas e integrações; tema claro/escuro
- [x] Versão v1.0.9: teste grátis de 14 dias com cadastro em /cadastro (CPF/CNPJ único), relógio no admin e bloqueio automático com contato pelo WhatsApp
- [x] Versão v1.0.10: rodízio por mesa e botão chamar garçom; cardápio com tamanhos, meio a meio, adicionais, combos e horários; promoções e cupons; taxa por km, mapa e rota do delivery; comanda cartão, consumação mínima, divisão, comissão, fila e reserva online; balança; compras por XML, curva ABC e transferência; contas a receber, fluxo de caixa, conciliação OFX e boletos; campanhas de WhatsApp e avaliação no Google; relatórios avançados; Oxy no lugar da IA
- [ ] Instalar o Oxys Servidor numa loja real
- [x] Loja online e cardápio QR para lojas com servidor dedicado (mesmo endereço de sempre; a nuvem repassa para o servidor da loja com assinatura)
- [ ] Robô de WhatsApp, iFood, emissão de NFC-e e marketing no servidor dedicado
- [x] Fotos (cardápio, logo, vitrine) guardadas no servidor dedicado e na central: baixadas da nuvem uma vez e servidas sem internet
- [x] App de computador lembra o endereço do servidor da loja e, sem internet, abre direto pela rede da loja (antes ainda abria o servidor no navegador externo)
- [x] Totem, avaliação (NPS) e cashback na loja online funcionando no servidor dedicado

## 11. Filiais (plano Enterprise)
- [x] Dono (admin da matriz) cria filiais pelo sistema, até o limite definido pelo super admin para cada loja
- [x] Cada filial com cardápio próprio (começa como cópia do da matriz), equipe, caixa, estoque e relatórios separados
- [x] Cargos Gerente (administra uma filial) e Supervisor (administra as filiais ligadas a ele)
- [x] Gerente não vê outras lojas, não muda plano, não cria gerentes, supervisores nem filiais
- [x] Dono e supervisor trocam de loja pelo seletor do painel; o dono entra automaticamente como admin de cada filial
- [x] "Chamar gerente" e avisos do admin chegam também ao gerente e ao supervisor
- [x] Segurança: plano, situação, matriz e limite de filiais só mudam pelo super admin (antes o admin conseguia trocar o próprio plano pela API)
- [x] Painel da rede: faturamento, pedidos, ticket médio, caixas abertos, gráfico por dia por loja, mais vendidos e formas de pagamento, somando todas as lojas (dono e supervisores)
- [x] Enviar o cardápio da matriz para as filiais com um clique (itens novos, nomes/fotos/fiscal, preços e disponibilidade — o que escolher)

## 12. Balanço de estoque
- [x] Balanço a qualquer hora ou agendado (toda semana, a cada 2 semanas ou todo mês); no dia ele é criado sozinho e os responsáveis recebem aviso
- [x] Foto do estoque do sistema no início; contagem item a item com busca, filtros e progresso, salva a cada campo (pode parar e continuar depois)
- [x] Contagem às cegas (opcional): quem conta não vê o número do sistema
- [x] Toda diferença exige motivo (perda, vencimento, erro de lançamento, consumo interno, furto, entrada não registrada, outro) e justificativa
- [x] Relatório do responsável: nome, cargo, observações e assinatura; opção de ajustar o estoque para o contado (vira movimentação "Ajuste de balanço")
- [x] Na filial o balanço fica com o gerente e o supervisor da loja e o resultado vai para a matriz (aviso + histórico com a visão "Toda a rede")
- [x] Relatório para baixar em PDF e em planilha (Excel), também no portal Financeiro
- [x] Funciona no servidor dedicado (mesmas regras e a agenda roda no próprio servidor)
- [x] Balanço na central offline: iniciar, contar e concluir sem internet; a nuvem conclui com o mesmo cálculo (ajuste do estoque e avisos) ao sincronizar
- [ ] Alterar o Estoque (entradas, saídas, cadastro) na central offline — hoje só consulta

## 13. Vendas e gestão (pacote de outubro)
- [x] Custo do prato (CMV): custo pela ficha técnica × custo do estoque, CMV %, margem, CMV realizado e lucro bruto do período, planilha (Cardápio → Custo e margem e Financeiro → CMV); custo ao vivo ao editar o item
- [x] Taxa de serviço (%) e couvert por pessoa: configuráveis, o caixa pode retirar a taxa na hora, valores gravados na comanda, no recibo (navegador e impressoras) e na NFC-e (outras despesas); funcionam na central offline
- [x] Fidelidade de verdade: pontos, cashback ou selos acumulam quando a conta é paga com o telefone do cliente (antes só havia a configuração); extrato por cliente
- [x] Cashback como forma de pagamento no caixa (valida o saldo; estorno devolve), também no servidor dedicado
- [x] Avaliação pós-pedido (NPS): QR Code no recibo e botão no acompanhamento online; notas 0–10 + estrelas de comida/atendimento/tempo; painel com NPS, distribuição e comentários; resposta da loja; aviso na hora para nota baixa
- [x] Pacote do contador: ZIP do mês com XMLs das NFC-e, notas, resumo, vendas por dia/forma de pagamento, produtos com NCM/CFOP, despesas e folha; link de 7 dias para WhatsApp/email; XML de cada nota guardado no sistema
- [x] Autoatendimento (totem/tablet): tela de toque com senha do dia, comer aqui ou levar, celular para fidelidade; pedido vai para a cozinha e para Delivery → Pedidos (pagamento no caixa)
- [x] Funcionário com email que já é cliente: usa a mesma conta e a mesma senha; ao sair da equipe a conta de cliente continua (também para gerente/supervisor de filiais)
- [~] 99Food, Keeta e Rappi: recebimento automático pronto (endereço por loja, códigos dos produtos, cancelamento, aviso de item sem vínculo) — falta o contrato de parceria e validar o formato do pedido de cada app; aceitar/recusar e status de volta para o app dependem da API de cada um
- [x] Totem funcionando na central offline e no servidor dedicado (senha do dia, cozinha e envio para a nuvem depois)
- [x] Avaliação: no servidor dedicado responde o servidor da loja; na central offline o link do recibo vale assim que o pedido sincroniza
- [x] Usar o cashback na loja online (abate do total; o caixa cobra só o restante)
- [ ] Pagar no próprio totem (depende do Pix automático / maquininha)

## 9. Configurações externas pendentes
- [~] Email próprio (SMTP, ex.: Resend) no Supabase — libera "Esqueci minha senha" dos clientes
- [~] Ligar a proteção contra senhas vazadas no Supabase (Auth → Password security)

---

## Próximas integrações
- [ ] IA própria do Oxy (texto e voz, pedidos falados) — assistente de IA anterior removido em 10/10/2026; decidir entre modelo aberto em servidor próprio e motor de comandos sem IA
- [ ] Servidor dedicado: WhatsApp, iFood, NFC-e e marketing (precisam de uma ponte de dados entre a nuvem e o servidor)
- [ ] Pix automático (QR dinâmico + baixa sozinha)
- [ ] Maquininha integrada (Stone, PagSeguro, Mercado Pago Point)
- [~] 99Food, Keeta e Rappi automáticos (estrutura pronta; falta contrato de parceria com cada app)
- [ ] Recuperação de senha do cliente da loja (depois do SMTP)

## Decisões em aberto
- [x] Modo offline: guardar o hash das senhas da equipe na central, criptografado (decidido: sim)
- [ ] Apagar a venda de teste "TESTE NFCE" (R$ 38) do restaurante Teste?
- [ ] Manter ou remover a vitrine de demonstração do restaurante Teste?
- [ ] Repositório do GitHub continua público? (a atualização automática do app de computador depende disso)
