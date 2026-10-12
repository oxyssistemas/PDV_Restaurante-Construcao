import { jsPDF } from 'jspdf';
import { PORTALS, WELCOME_ADMIN, toursOfPortal, type PortalKey } from '@/lib/oxyTours';
import { OXYS_WHATSAPP_LABEL } from '@/lib/trial';

// Treinamentos em PDF gerados a partir das dicas do Oxy (sempre em dia com as telas).

const ORANGE: [number, number, number] = [249, 115, 22];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];

/** Oxy parado, em SVG simples (para a capa do PDF). */
const OXY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" width="240" height="320">
<ellipse cx="60" cy="154" rx="26" ry="4" fill="#000" opacity="0.15"/>
<rect x="45" y="136" width="11" height="13" rx="4" fill="#9A3412"/><rect x="64" y="136" width="11" height="13" rx="4" fill="#9A3412"/>
<rect x="24" y="104" width="12" height="28" rx="6" fill="#F97316"/><circle cx="30" cy="134" r="6.5" fill="#FFF" stroke="#E5E7EB"/>
<g transform="rotate(-140 84 106)"><rect x="84" y="104" width="12" height="28" rx="6" fill="#F97316"/><circle cx="90" cy="134" r="6.5" fill="#FFF" stroke="#E5E7EB"/></g>
<rect x="34" y="98" width="52" height="42" rx="16" fill="#EA580C"/><path d="M44 103 h32 v25 q0 9 -9 9 h-14 q-9 0 -9 -9z" fill="#FFF"/>
<circle cx="60" cy="118" r="6" fill="none" stroke="#F97316" stroke-width="2.6"/><rect x="52" y="92" width="16" height="8" rx="3" fill="#C2410C"/>
<circle cx="22" cy="70" r="6" fill="#EA580C"/><circle cx="98" cy="70" r="6" fill="#EA580C"/>
<rect x="22" y="40" width="76" height="56" rx="22" fill="#F97316"/><rect x="31" y="49" width="58" height="38" rx="13" fill="#0F172A"/>
<rect x="43.5" y="60" width="9" height="11" rx="4.5" fill="#67E8F9"/><rect x="67.5" y="60" width="9" height="11" rx="4.5" fill="#67E8F9"/>
<path d="M51 77 Q60 85 69 77" fill="none" stroke="#67E8F9" stroke-width="3" stroke-linecap="round"/>
<rect x="34" y="30" width="52" height="13" rx="4" fill="#FFF" stroke="#E5E7EB"/><circle cx="44" cy="24" r="12" fill="#FFF" stroke="#E5E7EB"/>
<circle cx="60" cy="17" r="14" fill="#FFF" stroke="#E5E7EB"/><circle cx="76" cy="24" r="12" fill="#FFF" stroke="#E5E7EB"/><rect x="36" y="28" width="48" height="8" fill="#FFF"/>
</svg>`;

function oxyPng(): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 240; c.height = 320;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 240, 320);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(OXY_SVG)}`;
    } catch { resolve(null); }
  });
}

class Writer {
  doc = new jsPDF({ unit: 'mm', format: 'a4' });
  y = 20;
  readonly left = 18;
  readonly width = 174;

  ensure(h: number) {
    if (this.y + h > 280) { this.footer(); this.doc.addPage(); this.y = 20; }
  }
  footer() {
    const d = this.doc;
    d.setFontSize(8); d.setTextColor(...MUTED);
    d.text(`Oxys Restaurante · treinamento · página ${d.getNumberOfPages()}`, this.left, 290);
    d.text(`Dúvidas: WhatsApp ${OXYS_WHATSAPP_LABEL}`, 192, 290, { align: 'right' });
  }
  heading(text: string) {
    this.ensure(16);
    const d = this.doc;
    d.setFillColor(...ORANGE); d.rect(this.left, this.y - 4.5, 2, 7, 'F');
    d.setFont('helvetica', 'bold'); d.setFontSize(14); d.setTextColor(...INK);
    d.text(text, this.left + 5, this.y + 1);
    this.y += 9;
  }
  item(title: string, text: string) {
    const d = this.doc;
    d.setFontSize(10.5);
    const lines = d.splitTextToSize(text, this.width - 6) as string[];
    this.ensure(6 + lines.length * 5);
    d.setFont('helvetica', 'bold'); d.setTextColor(...INK);
    d.text(`• ${title}`, this.left + 2, this.y);
    this.y += 5;
    d.setFont('helvetica', 'normal'); d.setTextColor(51, 65, 85);
    d.text(lines, this.left + 6, this.y);
    this.y += lines.length * 5 + 2.5;
  }
  paragraph(text: string) {
    const d = this.doc;
    d.setFont('helvetica', 'normal'); d.setFontSize(11); d.setTextColor(51, 65, 85);
    const lines = d.splitTextToSize(text, this.width) as string[];
    this.ensure(lines.length * 5.4 + 2);
    d.text(lines, this.left, this.y);
    this.y += lines.length * 5.4 + 3;
  }
  async cover(title: string, subtitle: string, intro: string) {
    const d = this.doc;
    d.setFillColor(...ORANGE); d.rect(0, 0, 210, 60, 'F');
    d.setTextColor(255, 255, 255);
    d.setFont('helvetica', 'bold'); d.setFontSize(24); d.text(title, this.left, 30);
    d.setFont('helvetica', 'normal'); d.setFontSize(12); d.text(subtitle, this.left, 40);
    d.setFontSize(9); d.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, this.left, 50);
    const png = await oxyPng();
    if (png) d.addImage(png, 'PNG', 160, 8, 33, 44);
    this.y = 74;
    d.setFont('helvetica', 'bold'); d.setFontSize(12); d.setTextColor(...INK);
    d.text('Oi! Eu sou o Oxy, o assistente da Oxys.', this.left, this.y);
    this.y += 7;
    this.paragraph(intro);
    this.y += 2;
  }
  save(name: string) {
    this.footer();
    this.doc.save(name);
  }
}

/** Treinamento de um portal. */
export async function downloadPortalTraining(portal: PortalKey) {
  const info = PORTALS[portal];
  const w = new Writer();
  await w.cover(`Treinamento: ${info.label}`, `Para: ${info.who}`, info.intro);
  w.heading('Como entrar');
  w.paragraph('Acesse www.oxysrestaurante.app (ou o app da Oxys no computador e no celular) e entre com o email e a senha criados pelo administrador. Você cai direto na sua tela. Se a internet cair, continue normalmente: o sistema funciona pela central da loja e envia tudo quando a internet voltar.');
  for (const tour of toursOfPortal(portal)) {
    w.heading(tour.title);
    tour.steps.forEach(s => w.item(s.title, s.text));
  }
  w.heading('Precisa de ajuda?');
  w.paragraph(`Clique no Oxy, no canto inferior da tela, para rever as dicas de cada tela a qualquer momento. Para falar com a equipe da Oxys: WhatsApp ${OXYS_WHATSAPP_LABEL}.`);
  w.save(`treinamento-oxys-${info.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.pdf`);
}

/** Treinamento geral (visão de todos os portais). */
export async function downloadGeneralTraining() {
  const w = new Writer();
  await w.cover('Treinamento geral Oxys', 'Visão completa do sistema para o dono e a equipe',
    'A Oxys junta tudo do restaurante num lugar só: salão, cozinha, caixa, delivery, estoque, fiscal e financeiro. Cada pessoa tem um portal com só o que precisa, e tudo conversa em tempo real.');
  w.heading('Primeiros passos');
  WELCOME_ADMIN.steps.slice(1).forEach(s => w.item(s.title.replace(/[🎉👋]/gu, '').trim(), s.text));
  w.heading('Os portais');
  (Object.keys(PORTALS) as PortalKey[]).forEach(p => w.item(`${PORTALS[p].label} (${PORTALS[p].who})`, PORTALS[p].intro));
  for (const p of Object.keys(PORTALS) as PortalKey[]) {
    const tours = toursOfPortal(p);
    if (!tours.length) continue;
    w.heading(`Portal ${PORTALS[p].label}`);
    tours.forEach(t => w.item(t.title, t.steps.map(s => s.text).join(' ')));
  }
  w.heading('Sem internet');
  w.paragraph('Com a central ligada no computador do caixa, garçom, cozinha e caixa continuam funcionando mesmo sem internet. Quando a conexão volta, tudo é enviado para a nuvem na ordem, sem duplicar.');
  w.heading('Suporte');
  w.paragraph(`Clique no Oxy em qualquer tela para rever as dicas. Equipe Oxys no WhatsApp ${OXYS_WHATSAPP_LABEL}.`);
  w.save('treinamento-oxys-geral.pdf');
}
