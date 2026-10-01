/**
 * Impressão térmica (58mm / 80mm).
 * As funções render* montam o HTML do cupom; printHtml manda para a impressora do navegador
 * (janela de impressão, ou direto quando o Chrome roda com --kiosk-printing).
 */

export type ThermalWidth = '58mm' | '80mm';

/** Tipos de impressão que podem ser mapeados para impressoras diferentes. */
export type PrintPurpose = 'order' | 'kitchen' | 'receipt';

export const printPurposeLabels: Record<PrintPurpose, string> = {
  order: 'Pedido detalhado (comanda)',
  kitchen: 'Via da cozinha',
  receipt: 'Recibo de pagamento',
};

export const printPurposes: PrintPurpose[] = ['order', 'kitchen', 'receipt'];

/** Modelos suportados; cada um ajusta a largura padrão sugerida. */
export const printerModels: { value: string; label: string; width: ThermalWidth }[] = [
  { value: 'generic', label: 'Genérica ESC/POS 80mm', width: '80mm' },
  { value: 'generic_58', label: 'Genérica ESC/POS 58mm', width: '58mm' },
  { value: 'epson_tm_t20', label: 'Epson TM-T20 / T20X', width: '80mm' },
  { value: 'epson_tm_t88', label: 'Epson TM-T88', width: '80mm' },
  { value: 'elgin_i9', label: 'Elgin i9', width: '80mm' },
  { value: 'elgin_i7', label: 'Elgin i7', width: '80mm' },
  { value: 'bematech_mp4200', label: 'Bematech MP-4200 TH', width: '80mm' },
  { value: 'daruma_dr800', label: 'Daruma DR800', width: '80mm' },
  { value: 'tanca_tp650', label: 'Tanca TP-650', width: '80mm' },
  { value: 'sweda_si300', label: 'Sweda SI-300', width: '80mm' },
  { value: 'mp4200_58', label: 'Mini impressora 58mm (Bluetooth)', width: '58mm' },
];

export const printerModelLabel = (v?: string | null) =>
  printerModels.find(m => m.value === v)?.label ?? 'Genérica ESC/POS 80mm';

export interface PrinterConfig {
  purpose: PrintPurpose;
  enabled: boolean;
  model: string;
  device_name?: string | null;
  width: ThermalWidth;
  copies: number;
  header_note?: string | null;
  footer_note?: string | null;
}

export const defaultPrinterConfig = (purpose: PrintPurpose): PrinterConfig => ({
  purpose,
  enabled: true,
  model: 'generic',
  device_name: null,
  width: '80mm',
  copies: 1,
  header_note: null,
  footer_note: null,
});


export interface PrintItem {
  name: string;
  quantity: number;
  unit_price: number;
  notes?: string | null;
  status?: string | null;
}

export interface PrintOrder {
  id: string;
  created_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  table_number?: number | null;
  order_type?: string | null;
  notes?: string | null;
  delivery_fee?: number | null;
  total?: number | null;
  created_by_name?: string | null;
  created_by_role?: string | null;
}

export interface PrintPayment {
  method: string;
  amount: number;
}

const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

const dt = (v?: string | null) =>
  new Date(v || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const typeLabels: Record<string, string> = {
  dine_in: 'Mesa',
  delivery: 'Delivery',
  takeaway: 'Retirada',
};

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartao Credito',
  debit_card: 'Cartao Debito',
  pix: 'PIX',
};

function shell(width: ThermalWidth, body: string) {
  const pad = width === '58mm' ? '2mm' : '3mm';
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Impressao</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: ${width}; margin: 0; padding: ${pad}; font-family: "Courier New", ui-monospace, monospace;
         font-size: ${width === '58mm' ? '11px' : '12px'}; line-height: 1.35; color: #000; background: #fff; }
  h1 { font-size: ${width === '58mm' ? '13px' : '15px'}; margin: 0 0 2px; text-align: center; text-transform: uppercase; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row span:last-child { white-space: nowrap; }
  .item { margin-bottom: 3px; }
  .obs { padding-left: 8px; font-style: italic; }
  .total { font-size: ${width === '58mm' ? '13px' : '15px'}; font-weight: 700; }
  .small { font-size: ${width === '58mm' ? '9px' : '10px'}; }
  .cut { page-break-before: always; }
</style></head><body>${body}</body></html>`;
}

export function printHtml(html: string): Promise<void> {
  return new Promise(resolve => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); resolve(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print(); // bloqueia até a janela de impressão fechar (ou imprime direto no modo quiosque)
    setTimeout(() => { iframe.remove(); resolve(); }, 1500);
  };
  if (iframe.contentWindow?.document.readyState === 'complete') setTimeout(run, 150);
  else iframe.onload = () => setTimeout(run, 150);
  });
}

function header(restaurantName: string, title: string, order: PrintOrder) {
  const lines: string[] = [];
  lines.push(`<h1>${esc(restaurantName)}</h1>`);
  lines.push(`<div class="center bold">${esc(title)}</div>`);
  lines.push('<div class="sep"></div>');
  lines.push(`<div class="row"><span>Pedido</span><span>#${esc(order.id.slice(0, 8).toUpperCase())}</span></div>`);
  lines.push(`<div class="row"><span>Data</span><span>${esc(dt(order.created_at))}</span></div>`);
  if (order.order_type) lines.push(`<div class="row"><span>Tipo</span><span>${esc(typeLabels[order.order_type] || order.order_type)}</span></div>`);
  if (order.table_number != null) lines.push(`<div class="row"><span>Mesa</span><span>${esc(order.table_number)}</span></div>`);
  if (order.customer_name) lines.push(`<div class="row"><span>Cliente</span><span>${esc(order.customer_name)}</span></div>`);
  if (order.customer_phone) lines.push(`<div class="row"><span>Telefone</span><span>${esc(order.customer_phone)}</span></div>`);
  if (order.customer_address) lines.push(`<div class="small">End.: ${esc(order.customer_address)}</div>`);
  if (order.created_by_name) lines.push(`<div class="row small"><span>Lancado por</span><span>${esc(order.created_by_name)}</span></div>`);
  return lines.join('');
}

function itemsBlock(items: PrintItem[], showPrices: boolean) {
  const rows = items.map(i => {
    const line = showPrices
      ? `<div class="row"><span>${i.quantity}x ${esc(i.name)}</span><span>${money(i.quantity * i.unit_price)}</span></div>`
      : `<div class="bold">${i.quantity}x ${esc(i.name)}</div>`;
    const obs = i.notes ? `<div class="obs small">Obs: ${esc(i.notes)}</div>` : '';
    return `<div class="item">${line}${obs}</div>`;
  });
  return `<div class="sep"></div>${rows.join('')}`;
}

/** Monta o HTML final respeitando a configuração da impressora (largura, vias, notas). */
function compose(body: string, config?: PrinterConfig | null, widthOverride?: ThermalWidth) {
  const width = widthOverride || config?.width || '80mm';
  const copies = Math.min(Math.max(config?.copies ?? 1, 1), 5);
  const pre = config?.header_note ? `<div class="center small">${esc(config.header_note)}</div><div class="sep"></div>` : '';
  const post = config?.footer_note ? `<div class="sep"></div><div class="center small">${esc(config.footer_note)}</div>` : '';
  const one = pre + body + post;
  const all = Array.from({ length: copies }, (_, i) => (i === 0 ? one : `<div class="cut"></div>${one}`)).join('');
  return shell(width, all);
}

function emit(body: string, config?: PrinterConfig | null, widthOverride?: ThermalWidth) {
  if (config && config.enabled === false) return;
  printHtml(compose(body, config, widthOverride));
}

type OrderTicketOptions = {
  restaurantName: string;
  order: PrintOrder;
  items: PrintItem[];
  width?: ThermalWidth;
  title?: string;
  showPrices?: boolean;
  config?: PrinterConfig | null;
};

function orderTicketBody(opts: OrderTicketOptions) {
  const { restaurantName, order, items, title = 'Pedido detalhado', showPrices = true } = opts;
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const fee = Number(order.delivery_fee || 0);
  const body = [
    header(restaurantName, title, order),
    itemsBlock(items, showPrices),
    '<div class="sep"></div>',
    showPrices ? `<div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>` : '',
    showPrices && fee > 0 ? `<div class="row"><span>Taxa entrega</span><span>${money(fee)}</span></div>` : '',
    showPrices ? `<div class="row total"><span>TOTAL</span><span>${money(order.total ?? subtotal + fee)}</span></div>` : '',
    order.notes ? `<div class="sep"></div><div class="small">Obs.: ${esc(order.notes)}</div>` : '',
    '<div class="sep"></div>',
    `<div class="center small">${esc(dt())}</div>`,
    '<div class="small">&nbsp;</div><div class="small">&nbsp;</div>',
  ].join('');
  return body;
}

/** HTML do pedido detalhado (comanda / via da cozinha). */
export const renderOrderTicket = (opts: OrderTicketOptions) => compose(orderTicketBody(opts), opts.config, opts.width);

/** Pedido detalhado (comanda / via da cozinha). */
export function printOrderTicket(opts: OrderTicketOptions) {
  emit(orderTicketBody(opts), opts.config, opts.width);
}

type ReceiptOptions = {
  restaurantName: string;
  order: PrintOrder;
  items: PrintItem[];
  payments: PrintPayment[];
  change?: number;
  width?: ThermalWidth;
  footerNote?: string;
  config?: PrinterConfig | null;
};

function receiptBody(opts: ReceiptOptions) {
  const { restaurantName, order, items, payments, change = 0 } = opts;
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const fee = Number(order.delivery_fee || 0);
  const total = order.total ?? subtotal + fee;
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const body = [
    header(restaurantName, 'Recibo de pagamento', order),
    itemsBlock(items, true),
    '<div class="sep"></div>',
    `<div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>`,
    fee > 0 ? `<div class="row"><span>Taxa entrega</span><span>${money(fee)}</span></div>` : '',
    `<div class="row total"><span>TOTAL</span><span>${money(total)}</span></div>`,
    '<div class="sep"></div>',
    payments
      .map(p => `<div class="row"><span>${esc(methodLabels[p.method] || p.method)}</span><span>${money(p.amount)}</span></div>`)
      .join(''),
    `<div class="row"><span>Pago</span><span>${money(paid)}</span></div>`,
    change > 0 ? `<div class="row"><span>Troco</span><span>${money(change)}</span></div>` : '',
    '<div class="sep"></div>',
    `<div class="center small">${esc(opts.footerNote || 'Documento sem valor fiscal')}</div>`,
    `<div class="center small">Obrigado pela preferencia!</div>`,
    `<div class="center small">${esc(dt())}</div>`,
    '<div class="small">&nbsp;</div><div class="small">&nbsp;</div>',
  ].join('');
  return body;
}

/** HTML do recibo de pagamento (sem valor fiscal). */
export const renderReceipt = (opts: ReceiptOptions) => compose(receiptBody(opts), opts.config, opts.width);

/** Recibo de pagamento (nao possui valor fiscal). */
export function printReceipt(opts: ReceiptOptions) {
  emit(receiptBody(opts), opts.config, opts.width);
}

// ---------- DANFE NFC-e ----------
export interface NfceDocument {
  restaurant_name: string;
  emitter: { legal_name: string; trade_name: string | null; cnpj: string; state_registration: string | null; address: string };
  environment: 'homologation' | 'production';
  number: string | null; series: string | null; issued_at: string | null; access_key: string | null;
  protocol: string | null; consult_url: string | null; qrcode_url: string | null;
  consumer: { document: string | null; name: string | null };
  items: { code: string; name: string; quantity: number; unit: string; unit_price: number; total: number }[];
  delivery_fee: number; discount: number; total: number;
  payments: { code: string; amount: number }[]; change: number;
}

const NFCE_PAYMENT_LABELS: Record<string, string> = {
  '01': 'Dinheiro', '03': 'Cartao de Credito', '04': 'Cartao de Debito', '17': 'PIX', '99': 'Outros',
};
const fmtCnpj = (v: string) => v.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const fmtDoc = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : fmtCnpj(d);
};

/** DANFE NFC-e para bobina térmica, com QR Code da consulta (layout simplificado do Manual de Especificações). */
export async function renderNfce(doc: NfceDocument, config?: PrinterConfig | null): Promise<string> {
  const { default: QRCode } = await import('qrcode');
  const qr = doc.qrcode_url ? await QRCode.toDataURL(doc.qrcode_url, { margin: 0, width: 220, errorCorrectionLevel: 'M' }) : null;
  const homolog = doc.environment === 'homologation';
  const subtotal = doc.items.reduce((s, i) => s + i.total, 0);
  const key = (doc.access_key ?? '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const body = [
    `<div class="center bold">${esc(doc.emitter.trade_name || doc.emitter.legal_name)}</div>`,
    `<div class="center small">${esc(doc.emitter.legal_name)}</div>`,
    `<div class="center small">CNPJ ${esc(fmtCnpj(doc.emitter.cnpj))}${doc.emitter.state_registration ? ` IE ${esc(doc.emitter.state_registration)}` : ''}</div>`,
    `<div class="center small">${esc(doc.emitter.address)}</div>`,
    '<div class="sep"></div>',
    '<div class="center small bold">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletronica</div>',
    homolog ? '<div class="center small bold">EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</div>' : '',
    '<div class="sep"></div>',
    '<div class="row small bold"><span>Codigo Descricao</span><span>Qtde Un x Vl Unit = Total</span></div>',
    ...doc.items.map(i =>
      `<div class="item small"><div>${esc(i.code)} ${esc(i.name)}</div>` +
      `<div class="row"><span></span><span>${i.quantity} ${esc(i.unit)} x ${money(i.unit_price)} = ${money(i.total)}</span></div></div>`),
    '<div class="sep"></div>',
    `<div class="row"><span>Qtde. total de itens</span><span>${doc.items.length}</span></div>`,
    `<div class="row"><span>Valor total R$</span><span>${money(subtotal)}</span></div>`,
    doc.delivery_fee > 0 ? `<div class="row"><span>Outras despesas</span><span>${money(doc.delivery_fee)}</span></div>` : '',
    doc.discount > 0 ? `<div class="row"><span>Desconto R$</span><span>-${money(doc.discount)}</span></div>` : '',
    `<div class="row total"><span>Valor a pagar R$</span><span>${money(doc.total)}</span></div>`,
    '<div class="row small bold"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO R$</span></div>',
    ...doc.payments.map(p => `<div class="row small"><span>${esc(NFCE_PAYMENT_LABELS[p.code] ?? 'Outros')}</span><span>${money(p.amount)}</span></div>`),
    doc.change > 0 ? `<div class="row small"><span>Troco R$</span><span>${money(doc.change)}</span></div>` : '',
    '<div class="sep"></div>',
    `<div class="center small">Consulte pela Chave de Acesso em</div>`,
    `<div class="center small" style="word-break:break-all">${esc(doc.consult_url ?? '')}</div>`,
    `<div class="center small bold" style="word-break:break-all">${esc(key)}</div>`,
    '<div class="sep"></div>',
    `<div class="center small">${doc.consumer.document
      ? `CONSUMIDOR - ${esc(fmtDoc(doc.consumer.document))}${doc.consumer.name ? ` ${esc(doc.consumer.name)}` : ''}`
      : 'CONSUMIDOR NAO IDENTIFICADO'}</div>`,
    `<div class="center small bold">NFC-e n ${esc(doc.number ?? '')} Serie ${esc(doc.series ?? '')} ${esc(dt(doc.issued_at))}</div>`,
    `<div class="center small">Protocolo de autorizacao: ${esc(doc.protocol ?? '')}</div>`,
    `<div class="center small">Data de autorizacao: ${esc(dt(doc.issued_at))}</div>`,
    qr ? `<div class="center" style="margin:6px 0"><img src="${qr}" style="width:34mm;height:34mm" /></div>` : '',
    homolog ? '<div class="center small bold">EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</div>' : '',
    '<div class="small">&nbsp;</div><div class="small">&nbsp;</div>',
  ].join('');
  return compose(body, config);
}
