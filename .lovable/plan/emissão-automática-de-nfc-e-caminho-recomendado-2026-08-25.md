# Emissão automática de NFC-e — caminho recomendado

Objetivo: gerar a nota fiscal ao consumidor (NFC-e) automaticamente quando o pedido é quitado, com opção manual de emitir/reemitir, funcionando para qualquer restaurante do Oxys (cada um com CNPJ, certificado e numeração próprios).

## Emissor recomendado

**Focus NFe** para começar, com a integração isolada atrás de uma camada trocável.

| Emissor | Prós | Contras |
|---|---|---|
| Focus NFe | API REST simples, homologação grátis, webhook de autorização, barato por nota | Gestão multi-emitente mais manual |
| PlugNotas | Feito para multi-tenant, painel de emitentes/certificados | Um pouco mais caro |
| NuvemFiscal | Moderno, boa doc, preço competitivo | Base menor de casos em PDV |
| eNotas | Forte em NFS-e | Menos vantajoso para NFC-e |

Como o Oxys é multi-tenant, PlugNotas vira a melhor opção se a base crescer. Por isso a integração deve ficar atrás de uma interface `FiscalProvider` — trocar o emissor depois não deve tocar o resto do sistema.

## Restrição atual: sem contador

Sem contador não dá para homologar na SEFAZ (falta certificado A1, CSC e os códigos fiscais corretos). Por isso o trabalho se divide em duas partes: tudo que dá para construir e validar agora em homologação, e a parte que só destrava com o contador de cada cliente.

## Fases

### Fase 1 — Base fiscal (sem contador, já entregável)
- Tabela `fiscal_profiles` por restaurante: CNPJ, inscrição estadual, regime tributário, endereço fiscal, série e próximo número, ambiente (homologação/produção), CSC e ID do token — dados sensíveis criptografados no backend, nunca expostos ao cliente.
- Upload do certificado A1 (.pfx) para bucket privado, senha guardada como segredo. Nenhuma leitura pelo frontend.
- Campos fiscais no item do cardápio: NCM, CFOP, CST/CSOSN, origem — todos opcionais, herdando de um **padrão do restaurante** definido no perfil fiscal.
- Tela "Configuração Fiscal" no painel admin do restaurante, com indicador de prontidão ("faltam N itens sem NCM", "certificado vence em X dias").

### Fase 2 — Motor de emissão
- Edge function `emit-nfce`: monta o payload a partir do pedido + pagamentos + perfil fiscal, chama o provider e grava o retorno em `fiscal_invoices` (`provider_ref`, `xml_url`, `pdf_url`, chave de acesso, status).
- Emissão **assíncrona**: o caixa nunca fica travado esperando a SEFAZ. Ao quitar, cria-se a nota em `pending` e a função roda em segundo plano.
- Edge function `fiscal-webhook`: recebe a confirmação de autorização/rejeição do emissor e atualiza o status.
- Retentativa automática com backoff em falha de rede/SEFAZ; status `error` com a mensagem da SEFAZ visível na tela.

### Fase 3 — Gatilhos e operação
- Automático: ao quitar integralmente um pedido no caixa ou no delivery.
- Manual: botão "Emitir NFC-e" e "Reemitir" no painel de Notas Fiscais e na tela de pagamentos (já existe a base em `InvoicesPanel`).
- Cancelamento de NFC-e (janela de 30 min) e inutilização de faixa de numeração.
- Impressão do DANFE NFC-e em bobina 58/80mm reaproveitando `src/lib/printing.ts`, com QR Code da SEFAZ.
- Envio do link da nota por e-mail/WhatsApp ao cliente quando houver contato cadastrado.

### Fase 4 — Homologação por cliente (requer contador)
- Checklist guiado no admin: subir certificado, informar CSC, validar em homologação, emitir nota de teste, virar para produção.
- Enquanto o restaurante não completar o checklist, o sistema continua gerando pré-nota (comportamento atual), sem quebrar nada.

## Detalhes técnicos

- Novas tabelas: `fiscal_profiles` (1:1 com `restaurants`) e `fiscal_item_taxes` ou colunas fiscais direto em `menu_items` — decidir na implementação; colunas em `menu_items` é mais simples e suficiente.
- `fiscal_invoices` já tem `provider`, `provider_ref`, `xml_url`, `pdf_url`, `status` e `items` — serve como está, precisa apenas de `access_key`, `protocol`, `environment` e `error_message`.
- Segredos: chave de API do emissor por ambiente; senha do certificado por restaurante via secret manager, jamais em coluna comum.
- RLS: perfil fiscal legível só por `admin` e `finance` do próprio restaurante; escrita só por `admin`. Notas seguem o escopo de restaurante já existente.
- Todas as emissões, cancelamentos e alterações de perfil fiscal registradas em `audit_logs` via `logAudit`.

## Esforço estimado

Fase 1 é a maior parte de UI e cadastro. Fase 2 é o núcleo técnico. Fases 3 e 4 são incrementais. Recomendo começar pela Fase 1 — ela é útil de imediato e não depende de contador nem de escolha definitiva do emissor.
