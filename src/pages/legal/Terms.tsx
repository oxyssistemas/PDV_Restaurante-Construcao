import { Link } from 'react-router-dom';
import LegalLayout, { COMPANY, Mail, PRODUCT, SITE, type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    id: 'aceite',
    title: 'Aceite',
    body: <p>Ao criar uma conta ou usar o {PRODUCT} ({SITE}), você concorda com estes Termos e com a <Link to="/privacidade" className="text-primary underline underline-offset-2">Política de Privacidade</Link>. Se usa o sistema em nome de um restaurante, declara ter poderes para aceitá-los em nome dele.</p>,
  },
  {
    id: 'servico',
    title: 'O serviço',
    body: (
      <p>O {PRODUCT} é um software de gestão para restaurantes oferecido pela {COMPANY} no modelo de assinatura (SaaS), com módulos de PDV, mesas e comandas, cozinha, caixa, estoque, financeiro, delivery, fidelidade, emissão fiscal, integrações (como iFood) e marketing. Os módulos disponíveis dependem do plano contratado.</p>
    ),
  },
  {
    id: 'contas',
    title: 'Contas e acessos',
    body: (
      <ul>
        <li>O administrador do restaurante cria e gerencia os acessos da sua equipe e define as permissões de cada função.</li>
        <li>Cada pessoa deve usar o próprio login. Você é responsável por manter a senha em segredo e pelas ações feitas com a sua conta.</li>
        <li>Avise-nos imediatamente em caso de uso não autorizado.</li>
      </ul>
    ),
  },
  {
    id: 'responsabilidades',
    title: 'Responsabilidades do restaurante',
    body: (
      <ul>
        <li>Informar dados corretos e manter atualizados cardápio, preços, dados fiscais e cadastros.</li>
        <li>Tratar os dados dos seus clientes conforme a LGPD, inclusive obtendo consentimento para comunicações de marketing quando necessário.</li>
        <li>Conferir documentos fiscais emitidos e cumprir suas obrigações tributárias.</li>
        <li>Não usar o sistema para atividades ilegais, fraude, envio de spam ou violação de direitos de terceiros.</li>
      </ul>
    ),
  },
  {
    id: 'redes-sociais',
    title: 'Publicação em redes sociais',
    body: (
      <>
        <p>O portal de marketing permite conectar contas do Facebook, Instagram e TikTok e publicar conteúdo nelas. Ao usar esse recurso, você:</p>
        <ul>
          <li>Declara ser titular ou ter autorização para administrar as contas conectadas.</li>
          <li>É o único responsável pelo conteúdo publicado (textos, imagens, vídeos, músicas e marcas) e garante ter os direitos necessários sobre ele.</li>
          <li>Concorda em seguir os termos e as regras de comunidade da Meta e do TikTok.</li>
          <li>Entende que a publicação depende da disponibilidade e das regras dessas plataformas, que podem recusar, limitar ou remover conteúdos. Por exemplo, o TikTok pode restringir a visibilidade de posts enviados por aplicativos ainda não auditados.</li>
        </ul>
        <p>O {PRODUCT} só publica quando o usuário manda publicar, na hora ou no horário agendado, e pode ser desconectado a qualquer momento em Marketing → Conexões.</p>
      </>
    ),
  },
  {
    id: 'planos',
    title: 'Planos, pagamento e cancelamento',
    body: (
      <p>Os valores, a periodicidade e os módulos de cada plano são informados na contratação. A falta de pagamento pode levar à suspensão do acesso após aviso. O restaurante pode cancelar a qualquer momento; o acesso segue até o fim do período já pago. Após o cancelamento, os dados podem ser exportados mediante pedido e são excluídos conforme a Política de Privacidade.</p>
    ),
  },
  {
    id: 'disponibilidade',
    title: 'Disponibilidade e suporte',
    body: (
      <p>Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção, por falhas de terceiros (internet, hospedagem, integrações como iFood, Meta e TikTok) ou por motivos de força maior. Recomendamos manter procedimentos alternativos para a operação do restaurante em caso de indisponibilidade.</p>
    ),
  },
  {
    id: 'propriedade',
    title: 'Propriedade intelectual',
    body: (
      <p>O software, a marca {PRODUCT} e os materiais do sistema pertencem à {COMPANY}. A assinatura dá ao restaurante uma licença de uso, não exclusiva e intransferível, enquanto durar o contrato. Os dados e conteúdos inseridos pelo restaurante continuam sendo dele.</p>
    ),
  },
  {
    id: 'suspensao',
    title: 'Suspensão e encerramento',
    body: (
      <p>Podemos suspender ou encerrar o acesso em caso de violação destes Termos, uso ilegal, risco à segurança do sistema ou de terceiros, ou inadimplência, com aviso prévio sempre que possível.</p>
    ),
  },
  {
    id: 'responsabilidade',
    title: 'Limitação de responsabilidade',
    body: (
      <p>Na máxima extensão permitida por lei, a {COMPANY} não responde por lucros cessantes, perda de vendas ou danos indiretos, nem por atos de plataformas de terceiros. A responsabilidade total da {COMPANY} fica limitada ao valor pago pelo restaurante nos 12 meses anteriores ao fato. Nada nestes Termos afasta direitos que não possam ser limitados por lei.</p>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações',
    body: <p>Podemos atualizar estes Termos. A data no topo indica a versão em vigor, e mudanças relevantes serão avisadas no sistema ou por e-mail. Continuar usando o serviço após a atualização significa concordar com a nova versão.</p>,
  },
  {
    id: 'lei',
    title: 'Lei aplicável e contato',
    body: <p>Estes Termos seguem as leis do Brasil. Dúvidas e solicitações: <Mail />.</p>,
  },
];

export default function Terms() {
  return (
    <LegalLayout
      title="Termos de Uso"
      updatedAt="30 de setembro de 2026"
      intro={<p>Estes Termos regem o uso do {PRODUCT} pelos restaurantes e suas equipes.</p>}
      sections={sections}
    />
  );
}
