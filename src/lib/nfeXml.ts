/** Leitura do XML da NF-e de compra (arquivo que o fornecedor manda por email). */
export type NfeItem = {
  code: string; name: string; ncm: string | null; ean: string | null;
  unit: string; quantity: number; unit_price: number; total: number;
};
export type NfeInstallment = { number: string; due_date: string; amount: number };
export type NfePurchase = {
  access_key: string | null; number: string | null; issued_at: string | null;
  supplier: { document: string; name: string };
  items: NfeItem[]; installments: NfeInstallment[]; total: number;
};

const num = (v: string | null | undefined) => Number(String(v ?? '0').replace(',', '.')) || 0;

export function parseNfeXml(xml: string): NfePurchase {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo inválido: não é um XML.');
  const first = (parent: Element | Document, tag: string) => parent.getElementsByTagName(tag)[0] ?? null;
  const text = (parent: Element | Document | null, tag: string) => (parent ? first(parent, tag)?.textContent?.trim() ?? null : null);
  const inf = first(doc, 'infNFe');
  if (!inf) throw new Error('Este XML não é de uma NF-e.');
  const emit = first(inf, 'emit');
  const items = Array.from(inf.getElementsByTagName('det')).map(det => {
    const prod = first(det, 'prod')!;
    const ean = text(prod, 'cEAN');
    return {
      code: text(prod, 'cProd') ?? '', name: text(prod, 'xProd') ?? 'Produto', ncm: text(prod, 'NCM'),
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null, unit: (text(prod, 'uCom') ?? 'UN').toUpperCase(),
      quantity: num(text(prod, 'qCom')), unit_price: num(text(prod, 'vUnCom')), total: num(text(prod, 'vProd')),
    };
  });
  if (!items.length) throw new Error('A nota não tem itens.');
  const installments = Array.from(inf.getElementsByTagName('dup')).map(d => ({
    number: text(d, 'nDup') ?? '', due_date: text(d, 'dVenc') ?? '', amount: num(text(d, 'vDup')),
  })).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.due_date) && d.amount > 0);
  const id = inf.getAttribute('Id') ?? '';
  const key = id.replace(/^NFe/, '');
  return {
    access_key: /^\d{44}$/.test(key) ? key : null,
    number: text(first(inf, 'ide'), 'nNF'),
    issued_at: text(first(inf, 'ide'), 'dhEmi') ?? text(first(inf, 'ide'), 'dEmi'),
    supplier: { document: text(emit, 'CNPJ') ?? text(emit, 'CPF') ?? '', name: text(emit, 'xFant') ?? text(emit, 'xNome') ?? 'Fornecedor' },
    items, installments, total: num(text(first(inf, 'ICMSTot'), 'vNF')) || items.reduce((s, i) => s + i.total, 0),
  };
}

/** Nome comparável (sem acento, minúsculo, sem espaços repetidos). */
export const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
