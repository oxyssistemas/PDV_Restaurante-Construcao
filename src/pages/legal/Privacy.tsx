import LegalLayout, { COMPANY, Mail, PRODUCT, SITE, type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    id: 'quem-somos',
    title: 'Quem somos e papéis no tratamento',
    body: (
      <>
        <p>O {PRODUCT} é um sistema de gestão para restaurantes (PDV, mesas, cozinha, caixa, estoque, financeiro, delivery e marketing) oferecido pela {COMPANY} no endereço {SITE}.</p>
        <p>Para os <strong>dados dos usuários do sistema</strong> (donos, gerentes e funcionários dos restaurantes), a {COMPANY} atua como <strong>controladora</strong>.</p>
        <p>Para os <strong>dados que cada restaurante registra sobre os próprios clientes</strong> (nomes, telefones, endereços de entrega, pedidos), o restaurante é o <strong>controlador</strong> e a {COMPANY} atua como <strong>operadora</strong>, tratando esses dados apenas para prestar o serviço, conforme a Lei nº 13.709/2018 (LGPD).</p>
      </>
    ),
  },
  {
    id: 'dados-coletados',
    title: 'Dados que coletamos',
    body: (
      <>
        <p><strong>Conta e acesso:</strong> e-mail, senha (armazenada de forma criptografada, nunca em texto aberto), função no restaurante, registros de login e tentativas de acesso.</p>
        <p><strong>Operação do restaurante:</strong> cardápio, mesas, comandas, pedidos, pagamentos (valor e forma de pagamento, sem dados completos de cartão), caixa, estoque, fornecedores, contas a pagar, funcionários e escalas, programa de fidelidade e registros de auditoria.</p>
        <p><strong>Clientes do restaurante:</strong> nome, telefone, e-mail, documento, endereço e observações informados pelo restaurante ou pelo próprio cliente ao pedir pelo QR Code da mesa ou por delivery.</p>
        <p><strong>Dados fiscais:</strong> dados cadastrais da empresa, certificado digital e informações necessárias para emissão de notas fiscais.</p>
        <p><strong>Integrações com redes sociais</strong> (somente quando o restaurante conecta as contas, veja a seção 5).</p>
        <p><strong>Dados técnicos:</strong> informações de sessão guardadas no navegador para manter você conectado. Não usamos cookies de publicidade nem rastreadores de terceiros.</p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para que usamos os dados',
    body: (
      <ul>
        <li>Prestar o serviço contratado: registrar pedidos, enviar à cozinha, fechar contas, controlar estoque e gerar relatórios.</li>
        <li>Autenticar usuários, controlar permissões por função e proteger contra acessos indevidos.</li>
        <li>Emitir documentos fiscais quando o restaurante ativa essa função.</li>
        <li>Publicar conteúdo nas redes sociais conectadas, exatamente como o usuário pediu.</li>
        <li>Gerar respostas do assistente de IA com base nos dados do próprio restaurante, quando o recurso é usado.</li>
        <li>Dar suporte, corrigir falhas, manter a segurança e cumprir obrigações legais.</li>
      </ul>
    ),
  },
  {
    id: 'bases-legais',
    title: 'Bases legais',
    body: (
      <p>Tratamos dados com base na <strong>execução de contrato</strong> (art. 7º, V da LGPD), no <strong>cumprimento de obrigação legal ou regulatória</strong> (art. 7º, II), como as fiscais, no <strong>legítimo interesse</strong> para segurança e melhoria do serviço (art. 7º, IX) e no <strong>consentimento</strong> quando exigido, como ao conectar redes sociais ou ao cliente aceitar receber comunicações de marketing.</p>
    ),
  },
  {
    id: 'redes-sociais',
    title: 'Integração com Facebook, Instagram e TikTok',
    body: (
      <>
        <p>Ao clicar em "Conectar" no portal de marketing, o usuário é levado ao login oficial da Meta ou do TikTok e escolhe quais permissões conceder. O {PRODUCT} nunca recebe a senha dessas redes.</p>
        <p><strong>O que recebemos:</strong> tokens de acesso emitidos pela rede, identificador e nome das Páginas do Facebook, contas do Instagram Profissional e perfil do TikTok autorizados, e as opções de privacidade de postagem disponibilizadas pelo TikTok.</p>
        <p><strong>Como usamos:</strong> exclusivamente para publicar os textos, fotos e vídeos que o usuário cria e envia pelo portal, nas redes que ele escolher, e para mostrar o resultado da publicação (link, situação ou erro). Não lemos mensagens privadas, não publicamos nada sem ação do usuário e não usamos esses dados para publicidade.</p>
        <p><strong>Armazenamento:</strong> os tokens ficam em área restrita do banco de dados, acessível apenas pelos serviços do sistema, e nunca são enviados ao navegador. As mídias enviadas ficam em armazenamento privado e são entregues às redes por links temporários.</p>
        <p><strong>Como revogar:</strong> clique em "Desconectar" em Marketing → Conexões, o que apaga os tokens e as contas vinculadas. Você também pode remover o acesso diretamente nas configurações do Facebook (Integrações comerciais), do Instagram ou do TikTok (Segurança → Gerenciar permissões de apps).</p>
        <p>O uso desses dados segue também as políticas da Meta e do TikTok para desenvolvedores.</p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    title: 'Com quem compartilhamos',
    body: (
      <>
        <p>Não vendemos dados. Compartilhamos apenas com prestadores necessários ao funcionamento do serviço:</p>
        <ul>
          <li><strong>Supabase</strong>: banco de dados, autenticação e armazenamento de arquivos.</li>
          <li><strong>Vercel</strong>: hospedagem do site.</li>
          <li><strong>Meta e TikTok</strong>: somente o conteúdo que o usuário manda publicar, nas contas que ele conectou.</li>
          <li><strong>iFood</strong>: quando o restaurante ativa a integração, para receber e atualizar pedidos.</li>
          <li><strong>Google (Gemini)</strong>: resumos de dados do restaurante enviados ao assistente de IA, quando o recurso é usado.</li>
          <li><strong>Provedores de emissão fiscal e autoridades</strong>: quando exigido para notas fiscais ou por lei.</li>
        </ul>
        <p>Alguns desses prestadores armazenam dados fora do Brasil. Nesses casos, a transferência internacional ocorre para a execução do contrato e com fornecedores que adotam medidas de segurança compatíveis com a LGPD.</p>
      </>
    ),
  },
  {
    id: 'retencao',
    title: 'Por quanto tempo guardamos',
    body: (
      <p>Mantemos os dados enquanto a conta do restaurante estiver ativa. Após o encerramento, os dados são excluídos em até 90 dias, exceto os que precisamos guardar por obrigação legal (por exemplo, registros fiscais e contábeis pelo prazo exigido em lei). Tokens de redes sociais são apagados imediatamente ao desconectar a conta.</p>
    ),
  },
  {
    id: 'direitos',
    title: 'Seus direitos',
    body: (
      <>
        <p>Conforme o art. 18 da LGPD, você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade, informação sobre compartilhamento, revogação do consentimento e revisão de decisões automatizadas.</p>
        <p>Envie o pedido para <Mail />. Respondemos em até 15 dias. Se você é cliente de um restaurante, podemos encaminhar seu pedido ao restaurante, que é o controlador desses dados.</p>
        <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </>
    ),
  },
  {
    id: 'exclusao-de-dados',
    title: 'Como pedir a exclusão dos seus dados',
    body: (
      <>
        <p><strong>Dados das redes sociais:</strong> em Marketing → Conexões, clique em "Desconectar". Isso apaga na hora os tokens e as contas vinculadas. Publicações já feitas continuam nas redes e podem ser apagadas por lá.</p>
        <p><strong>Conta de usuário ou do restaurante:</strong> envie um e-mail para <Mail /> a partir do e-mail cadastrado, com o assunto "Exclusão de dados" e o nome do restaurante. Confirmamos o pedido e concluímos a exclusão em até 15 dias, mantendo apenas o que a lei obriga guardar.</p>
        <p><strong>Clientes de restaurantes:</strong> peça diretamente ao restaurante ou envie para <Mail /> informando o restaurante e o telefone ou e-mail usado nos pedidos.</p>
      </>
    ),
  },
  {
    id: 'seguranca',
    title: 'Segurança',
    body: (
      <p>Usamos conexões criptografadas (HTTPS), senhas com hash, controle de acesso por restaurante e por função em cada tabela do banco, bloqueio após tentativas de login seguidas e armazenamento privado para arquivos. Nenhum sistema é totalmente imune a incidentes; se ocorrer um que possa causar risco relevante, comunicaremos os afetados e a ANPD conforme a lei.</p>
    ),
  },
  {
    id: 'menores',
    title: 'Crianças e adolescentes',
    body: <p>O {PRODUCT} é destinado a empresas e seus funcionários maiores de 18 anos. Não coletamos intencionalmente dados de menores.</p>,
  },
  {
    id: 'alteracoes',
    title: 'Alterações nesta política',
    body: <p>Podemos atualizar esta política. A data no topo indica a última versão. Mudanças relevantes serão avisadas dentro do sistema ou por e-mail.</p>,
  },
  {
    id: 'contato',
    title: 'Contato',
    body: <p>{COMPANY}. E-mail: <Mail /></p>,
  },
];

export default function Privacy() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      updatedAt="30 de setembro de 2026"
      intro={<p>Esta política explica quais dados o {PRODUCT} coleta, por que coleta, com quem compartilha e como você pode exercer seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD).</p>}
      sections={sections}
    />
  );
}
