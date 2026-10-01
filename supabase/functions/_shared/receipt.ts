// Monta os cupons (cozinha, comanda, recibo, NFC-e, teste) como uma lista de operações
// independente de impressora; cada formato (ESC/POS, Epson ePOS, Star) serializa essas operações.
// Os mesmos documentos JSON da fila (print_jobs.document) que o navegador transforma em HTML.

export type Align = 'left' | 'center' | 'right';
export type Op =
  | { t: 'text'; s: string; align?: Align; bold?: boolean; big?: boolean }
  | { t: 'row'; l: string; r: string; bold?: boolean; big?: boolean }
  | { t: 'sep' }
  | { t: 'feed'; n: number }
  | { t: 'qr'; data: string }
  | { t: 'cut' };

export type PrinterOptions = { width: '58mm' | '80mm'; copies: number; header_note: string | null; footer_note: string | null };

// Térmicas comuns: 48 colunas em 80 mm, 32 em 58 mm (fonte A).
export const columns = (width: string) => (width === '58mm' ? 32 : 48);

/** Remove acentos: o conjunto de caracteres varia por modelo e acento quebrado vira lixo no papel. */
export const ascii = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n]/g, '');

const money = (v: unknown) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;
const dt = (v?: string | null) => {
  const d = v ? new Date(v) : new Date();
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const TYPE_LABELS: Record<string, string> = { dine_in: 'Mesa', delivery: 'Delivery', takeaway: 'Retirada' };
const METHOD_LABELS: Record<string, string> = { cash: 'Dinheiro', credit_card: 'Cartao Credito', debit_card: 'Cartao Debito', pix: 'PIX' };
const NFCE_METHODS: Record<string, string> = { '01': 'Dinheiro', '03': 'Cartao de Credito', '04': 'Cartao de Debito', '17': 'PIX', '99': 'Outros' };

function orderHeader(doc: any, title: string): Op[] {
  const o = doc.order ?? {};
  const ops: Op[] = [
    { t: 'text', s: doc.restaurant_name ?? '', align: 'center', bold: true, big: true },
    { t: 'text', s: title, align: 'center', bold: true },
    { t: 'sep' },
    { t: 'row', l: 'Pedido', r: `#${String(o.id ?? '').slice(0, 8).toUpperCase()}` },
    { t: 'row', l: 'Data', r: dt(o.created_at) },
  ];
  if (o.order_type) ops.push({ t: 'row', l: 'Tipo', r: TYPE_LABELS[o.order_type] ?? o.order_type });
  if (o.table_number != null) ops.push({ t: 'row', l: 'Mesa', r: String(o.table_number), bold: true, big: true });
  if (o.customer_name) ops.push({ t: 'row', l: 'Cliente', r: o.customer_name });
  if (o.customer_phone) ops.push({ t: 'row', l: 'Telefone', r: o.customer_phone });
  if (o.customer_address) ops.push({ t: 'text', s: `End.: ${o.customer_address}` });
  if (o.created_by_name) ops.push({ t: 'row', l: 'Lancado por', r: o.created_by_name });
  return ops;
}

function items(doc: any, prices: boolean): Op[] {
  const ops: Op[] = [{ t: 'sep' }];
  for (const i of doc.items ?? []) {
    ops.push(prices
      ? { t: 'row', l: `${i.quantity}x ${i.name}`, r: money(Number(i.quantity) * Number(i.unit_price)) }
      : { t: 'text', s: `${i.quantity}x ${i.name}`, bold: true, big: true });
    if (i.notes) ops.push({ t: 'text', s: `> Obs: ${i.notes}` });
  }
  return ops;
}

/** Operações do documento, já com vias, textos de topo/rodapé e corte. */
export function layout(doc: any, printer: PrinterOptions): Op[] {
  let body: Op[] = [];
  const k = doc.kind;
  if (k === 'kitchen' || k === 'order' || k === 'test') {
    const prices = k !== 'kitchen';
    const d = k === 'test'
      ? { restaurant_name: doc.restaurant_name, order: { id: '00000000', created_at: new Date().toISOString(), order_type: 'dine_in', table_number: 1, created_by_name: 'Teste de impressao' },
          items: [{ name: 'Item de exemplo', quantity: 1, unit_price: 10, notes: 'Impressao funcionando' }] }
      : doc;
    const sub = (d.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price ?? 0), 0);
    const fee = Number(d.order?.delivery_fee ?? 0);
    body = [
      ...orderHeader(d, k === 'kitchen' ? 'VIA DA COZINHA' : k === 'test' ? `TESTE - ${doc.printer_name}` : 'PEDIDO'),
      ...items(d, prices),
      { t: 'sep' },
      ...(prices ? [
        { t: 'row', l: 'Subtotal', r: money(sub) } as Op,
        ...(fee > 0 ? [{ t: 'row', l: 'Taxa entrega', r: money(fee) } as Op] : []),
        { t: 'row', l: 'TOTAL', r: money(d.order?.total ?? sub + fee), bold: true, big: true } as Op,
      ] : []),
      ...(d.order?.notes ? [{ t: 'text', s: `Obs.: ${d.order.notes}`, bold: true } as Op] : []),
    ];
  } else if (k === 'receipt') {
    const sub = (doc.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const fee = Number(doc.order?.delivery_fee ?? 0);
    const paid = (doc.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    body = [
      ...orderHeader(doc, 'RECIBO DE PAGAMENTO'),
      ...items(doc, true),
      { t: 'sep' },
      { t: 'row', l: 'Subtotal', r: money(sub) },
      ...(fee > 0 ? [{ t: 'row', l: 'Taxa entrega', r: money(fee) } as Op] : []),
      { t: 'row', l: 'TOTAL', r: money(doc.order?.total ?? sub + fee), bold: true, big: true },
      { t: 'sep' },
      ...(doc.payments ?? []).map((p: any) => ({ t: 'row', l: METHOD_LABELS[p.method] ?? p.method, r: money(p.amount) } as Op)),
      { t: 'row', l: 'Pago', r: money(paid) },
      ...(Number(doc.change) > 0 ? [{ t: 'row', l: 'Troco', r: money(doc.change) } as Op] : []),
      { t: 'sep' },
      { t: 'text', s: 'Documento sem valor fiscal', align: 'center' },
      { t: 'text', s: 'Obrigado pela preferencia!', align: 'center' },
    ];
  } else if (k === 'nfce') {
    const e = doc.emitter ?? {};
    const homolog = doc.environment === 'homologation';
    const sub = (doc.items ?? []).reduce((s: number, i: any) => s + Number(i.total), 0);
    const cnpj = String(e.cnpj ?? '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    body = [
      { t: 'text', s: e.trade_name || e.legal_name, align: 'center', bold: true },
      { t: 'text', s: e.legal_name, align: 'center' },
      { t: 'text', s: `CNPJ ${cnpj}${e.state_registration ? ` IE ${e.state_registration}` : ''}`, align: 'center' },
      { t: 'text', s: e.address ?? '', align: 'center' },
      { t: 'sep' },
      { t: 'text', s: 'DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletronica', align: 'center', bold: true },
      ...(homolog ? [{ t: 'text', s: 'EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', align: 'center', bold: true } as Op] : []),
      { t: 'sep' },
      ...(doc.items ?? []).flatMap((i: any) => [
        { t: 'text', s: `${i.code} ${i.name}` } as Op,
        { t: 'text', s: `${i.quantity} ${i.unit} x ${money(i.unit_price)} = ${money(i.total)}`, align: 'right' } as Op,
      ]),
      { t: 'sep' },
      { t: 'row', l: 'Qtde. total de itens', r: String((doc.items ?? []).length) },
      { t: 'row', l: 'Valor total', r: money(sub) },
      ...(Number(doc.delivery_fee) > 0 ? [{ t: 'row', l: 'Outras despesas', r: money(doc.delivery_fee) } as Op] : []),
      ...(Number(doc.discount) > 0 ? [{ t: 'row', l: 'Desconto', r: `-${money(doc.discount)}` } as Op] : []),
      { t: 'row', l: 'Valor a pagar', r: money(doc.total), bold: true },
      { t: 'row', l: 'FORMA DE PAGAMENTO', r: 'VALOR PAGO', bold: true },
      ...(doc.payments ?? []).map((p: any) => ({ t: 'row', l: NFCE_METHODS[p.code] ?? 'Outros', r: money(p.amount) } as Op)),
      ...(Number(doc.change) > 0 ? [{ t: 'row', l: 'Troco', r: money(doc.change) } as Op] : []),
      { t: 'sep' },
      { t: 'text', s: 'Consulte pela Chave de Acesso em', align: 'center' },
      { t: 'text', s: doc.consult_url ?? '', align: 'center' },
      { t: 'text', s: String(doc.access_key ?? '').replace(/(\d{4})(?=\d)/g, '$1 '), align: 'center', bold: true },
      { t: 'sep' },
      { t: 'text', s: doc.consumer?.document ? `CONSUMIDOR - ${doc.consumer.document}` : 'CONSUMIDOR NAO IDENTIFICADO', align: 'center' },
      { t: 'text', s: `NFC-e n ${doc.number ?? ''} Serie ${doc.series ?? ''} ${dt(doc.issued_at)}`, align: 'center', bold: true },
      { t: 'text', s: `Protocolo: ${doc.protocol ?? ''}`, align: 'center' },
      ...(doc.qrcode_url ? [{ t: 'qr', data: doc.qrcode_url } as Op] : []),
      ...(homolog ? [{ t: 'text', s: 'EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL', align: 'center', bold: true } as Op] : []),
    ];
  } else {
    body = [{ t: 'text', s: `Documento desconhecido (${k})` }];
  }

  const one: Op[] = [
    ...(printer.header_note ? [{ t: 'text', s: printer.header_note, align: 'center' } as Op, { t: 'sep' } as Op] : []),
    ...body,
    ...(printer.footer_note ? [{ t: 'sep' } as Op, { t: 'text', s: printer.footer_note, align: 'center' } as Op] : []),
    { t: 'text', s: dt(), align: 'center' },
    { t: 'feed', n: 3 },
    { t: 'cut' },
  ];
  const copies = Math.min(Math.max(Number(printer.copies) || 1, 1), 5);
  return Array.from({ length: copies }, () => one).flat();
}

// ---------- ESC/POS (Epson, Elgin, Bematech, Daruma, Tanca, Sweda e genéricas) ----------
function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= width) line += ' ' + word;
      else { out.push(line); line = word; }
      while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
    }
    out.push(line);
  }
  return out;
}

/** Linha "esquerda ....... direita" ajustada à largura. */
export function row(l: string, r: string, width: number): string[] {
  const left = ascii(l), right = ascii(r);
  if (left.length + right.length + 1 <= width) return [left + ' '.repeat(width - left.length - right.length) + right];
  const lines = wrap(left, width);
  const last = lines[lines.length - 1];
  if (last.length + right.length + 1 <= width) lines[lines.length - 1] = last + ' '.repeat(width - last.length - right.length) + right;
  else lines.push(' '.repeat(Math.max(0, width - right.length)) + right);
  return lines;
}

const ESC = 0x1b, GS = 0x1d;
const enc = new TextEncoder();

export function toEscPos(ops: Op[], width: '58mm' | '80mm'): Uint8Array {
  const cols = columns(width);
  const bytes: number[] = [ESC, 0x40]; // inicializa
  const push = (...b: number[]) => bytes.push(...b);
  const text = (s: string) => bytes.push(...enc.encode(ascii(s)));
  const style = (bold?: boolean, big?: boolean) => { push(ESC, 0x45, bold ? 1 : 0); push(GS, 0x21, big ? 0x11 : 0x00); };
  const align = (a?: Align) => push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);

  for (const op of ops) {
    switch (op.t) {
      case 'text': {
        const w = op.big ? Math.floor(cols / 2) : cols;
        align(op.align); style(op.bold, op.big);
        for (const line of wrap(ascii(op.s), w)) { text(line); push(0x0a); }
        style(false, false); align('left');
        break;
      }
      case 'row': {
        const w = op.big ? Math.floor(cols / 2) : cols;
        style(op.bold, op.big);
        for (const line of row(op.l, op.r, w)) { text(line); push(0x0a); }
        style(false, false);
        break;
      }
      case 'sep': text('-'.repeat(cols)); push(0x0a); break;
      case 'feed': push(ESC, 0x64, Math.min(op.n, 10)); break;
      case 'qr': {
        const data = enc.encode(op.data);
        const len = data.length + 3;
        align('center');
        push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00);         // modelo 2
        push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, width === '58mm' ? 5 : 6); // tamanho do módulo
        push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31);               // correção de erro M
        push(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...data);
        push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);               // imprime
        push(0x0a); align('left');
        break;
      }
      case 'cut': push(GS, 0x56, 0x42, 0x00); break; // corte parcial com avanço
    }
  }
  return new Uint8Array(bytes);
}

export const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
