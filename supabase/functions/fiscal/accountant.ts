import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { strToU8, zipSync } from 'npm:fflate@0.8.2';

// Pacote do mês para o contador: XMLs das NFC-e autorizadas + planilhas (abrem no Excel) + LEIAME.

const LINK_DAYS = 7;
const METHOD: Record<string, string> = { cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'PIX', cashback: 'Cashback (crédito loja)' };
const STATUS: Record<string, string> = { issued: 'Autorizada', cancelled: 'Cancelada', error: 'Rejeitada', pending: 'Pendente', draft: 'Rascunho' };
const REGIME: Record<string, string> = { simples_nacional: 'Simples Nacional', simples_excesso: 'Simples (excesso de sublimite)', regime_normal: 'Regime normal' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => round2(n).toFixed(2).replace('.', ',');
const num = (n: number) => String(round2(n)).replace('.', ',');
const brDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const brDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function csv(rows: (string | number | null | undefined)[][]) {
  const body = rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  return strToU8('﻿' + body);
}

/** Lê tudo de uma consulta, de mil em mil. */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export type XmlFetcher = (invoice: any) => Promise<string | null>;

/** Guarda o XML da nota no armazenamento próprio (uma vez); devolve o conteúdo. */
export async function archiveXml(db: SupabaseClient, invoice: any, fetchXml: XmlFetcher): Promise<string | null> {
  if (invoice.xml_path) {
    const { data } = await db.storage.from('fiscal-xml').download(invoice.xml_path);
    if (data) return await data.text();
  }
  const xml = await fetchXml(invoice).catch(() => null);
  if (!xml || !xml.includes('<')) return null;
  const when = (invoice.issued_at ?? invoice.created_at ?? new Date().toISOString()).slice(0, 7);
  const path = `${invoice.restaurant_id}/${when}/${invoice.access_key || invoice.id}.xml`;
  const { error } = await db.storage.from('fiscal-xml').upload(path, new Blob([xml], { type: 'application/xml' }), { upsert: true });
  if (!error) await db.from('fiscal_invoices').update({ xml_path: path }).eq('id', invoice.id);
  return xml;
}

export async function buildAccountantPackage(db: SupabaseClient, rid: string, month: string, userId: string, fetchXml: XmlFetcher) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido');
  const [y, m] = month.split('-').map(Number);
  // mês no horário de Brasília (UTC-3)
  const start = new Date(Date.UTC(y, m - 1, 1, 3)).toISOString();
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 3)).toISOString();
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [{ data: restaurant }, { data: profile }] = await Promise.all([
    db.from('restaurants').select('name').eq('id', rid).single(),
    db.from('fiscal_profiles').select('cnpj, legal_name, trade_name, state_registration, tax_regime, city, state, environment').eq('restaurant_id', rid).maybeSingle(),
  ]);

  const invoices = await all<any>((a, b) => db.from('fiscal_invoices').select('*').eq('restaurant_id', rid)
    .or(`and(issued_at.gte.${start},issued_at.lt.${end}),and(issued_at.is.null,created_at.gte.${start},created_at.lt.${end})`)
    .order('issued_at', { ascending: true, nullsFirst: false }).range(a, b));
  const payments = await all<any>((a, b) => db.from('payments').select('order_id, method, amount, change_amount, created_at').eq('restaurant_id', rid)
    .gte('created_at', start).lt('created_at', end).order('created_at').range(a, b));
  const items = await all<any>((a, b) => db.from('order_items')
    .select('quantity, unit_price, status, menu_items(name, ncm, cfop, csosn, commercial_unit), orders!inner(restaurant_id, status, created_at)')
    .eq('orders.restaurant_id', rid).gte('orders.created_at', start).lt('orders.created_at', end).neq('orders.status', 'cancelled')
    .neq('status', 'cancelled').range(a, b));
  const expenses = await all<any>((a, b) => db.from('accounts_payable').select('description, category, amount, due_date, status, paid_at, payment_method, suppliers(name, document)')
    .eq('restaurant_id', rid).or(`and(paid_at.gte.${start},paid_at.lt.${end}),and(due_date.gte.${month}-01,due_date.lte.${lastDay})`)
    .order('due_date').range(a, b));
  const payroll = await all<any>((a, b) => db.from('payroll_entries').select('type, reference_month, amount, status, paid_at, employees(name, document, role_title)')
    .eq('restaurant_id', rid).eq('reference_month', `${month}-01`).range(a, b)).catch(() => []);

  const files: Record<string, Uint8Array> = {};
  const warnings: string[] = [];

  // ---------- XMLs ----------
  let xmlCount = 0;
  for (const inv of invoices.filter(i => i.status === 'issued' || (i.status === 'cancelled' && i.access_key))) {
    const xml = await archiveXml(db, inv, fetchXml);
    if (xml) {
      files[`xml/${inv.status === 'cancelled' ? 'canceladas/' : ''}NFCe-${inv.series ?? '1'}-${inv.number ?? inv.id.slice(0, 8)}-${inv.access_key || inv.id}.xml`] = strToU8(xml);
      xmlCount++;
    }
  }
  const authorized = invoices.filter(i => i.status === 'issued');
  const authorizedXml = Object.keys(files).filter(f => !f.includes('canceladas/')).length;
  if (authorizedXml < authorized.length) warnings.push(`${authorized.length - authorizedXml} nota(s) autorizada(s) sem XML disponível no emissor.`);
  if (invoices.some(i => i.environment === 'homologation')) warnings.push('Há notas em ambiente de homologação (teste), sem valor fiscal.');

  // ---------- notas ----------
  files['notas_fiscais.csv'] = csv([
    ['Número', 'Série', 'Chave de acesso', 'Emissão', 'Situação', 'Ambiente', 'Cliente', 'CPF/CNPJ', 'Valor', 'Protocolo', 'Cancelamento', 'Motivo do cancelamento', 'Erro'],
    ...invoices.map(i => [i.number, i.series, i.access_key, brDate(i.issued_at ?? i.created_at), STATUS[i.status] ?? i.status,
      i.environment === 'production' ? 'Produção' : 'Homologação', i.customer_name, i.customer_document, money(Number(i.total)),
      i.protocol, brDate(i.cancelled_at), i.cancel_reason, i.status === 'error' ? i.error_message : '']),
  ]);

  // ---------- vendas por dia e forma de pagamento ----------
  const byDay = new Map<string, Record<string, number>>();
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const d = brDay(p.created_at);
    const row = byDay.get(d) ?? {};
    row[p.method] = (row[p.method] ?? 0) + Number(p.amount);
    byDay.set(d, row);
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
  }
  const methods = Object.keys(METHOD).filter(k => byMethod[k]);
  files['vendas_por_dia.csv'] = csv([
    ['Dia', ...methods.map(k => METHOD[k]), 'Total'],
    ...[...byDay.entries()].map(([d, r]) => [d, ...methods.map(k => money(r[k] ?? 0)), money(Object.values(r).reduce((s, v) => s + v, 0))]),
    ['Total', ...methods.map(k => money(byMethod[k])), money(Object.values(byMethod).reduce((s, v) => s + v, 0))],
  ]);

  // ---------- produtos vendidos (NCM/CFOP) ----------
  const prod = new Map<string, { name: string; ncm: string; cfop: string; csosn: string; unit: string; qty: number; total: number }>();
  for (const it of items) {
    const mi = it.menu_items ?? {};
    const key = `${mi.name}|${mi.ncm}|${mi.cfop}`;
    const cur = prod.get(key) ?? { name: mi.name ?? 'Item', ncm: mi.ncm ?? '', cfop: mi.cfop ?? '', csosn: mi.csosn ?? '', unit: mi.commercial_unit ?? 'UN', qty: 0, total: 0 };
    cur.qty += Number(it.quantity); cur.total += Number(it.quantity) * Number(it.unit_price);
    prod.set(key, cur);
  }
  const noNcm = [...prod.values()].filter(p => !p.ncm).length;
  if (noNcm) warnings.push(`${noNcm} produto(s) vendido(s) sem NCM no cadastro (usam o NCM padrão da configuração fiscal).`);
  files['produtos_vendidos.csv'] = csv([
    ['Produto', 'NCM', 'CFOP', 'CSOSN/CST', 'Unidade', 'Quantidade', 'Valor total'],
    ...[...prod.values()].sort((a, b) => b.total - a.total).map(p => [p.name, p.ncm, p.cfop, p.csosn, p.unit, num(p.qty), money(p.total)]),
  ]);

  // ---------- despesas e folha ----------
  files['despesas.csv'] = csv([
    ['Descrição', 'Categoria', 'Fornecedor', 'CNPJ/CPF do fornecedor', 'Valor', 'Vencimento', 'Situação', 'Pago em', 'Forma de pagamento'],
    ...expenses.map(e => [e.description, e.category, e.suppliers?.name, e.suppliers?.document, money(Number(e.amount)),
      e.due_date ? e.due_date.split('-').reverse().join('/') : '', e.status === 'paid' ? 'Pago' : e.status === 'cancelled' ? 'Cancelado' : 'Em aberto',
      brDate(e.paid_at), e.payment_method]),
  ]);
  if (payroll.length) {
    files['folha_de_pagamento.csv'] = csv([
      ['Funcionário', 'CPF', 'Cargo', 'Lançamento', 'Valor', 'Situação', 'Pago em'],
      ...payroll.map(p => [p.employees?.name, p.employees?.document, p.employees?.role_title, p.type, money(Number(p.amount)),
        p.status === 'paid' ? 'Pago' : 'Em aberto', brDate(p.paid_at)]),
    ]);
  }

  // ---------- resumo ----------
  const revenue = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const invoiced = round2(authorized.reduce((s, i) => s + Number(i.total), 0));
  const cancelled = invoices.filter(i => i.status === 'cancelled');
  const paidOrders = new Set(payments.map(p => p.order_id));
  const invoicedOrders = new Set(authorized.map(i => i.order_id).filter(Boolean));
  const withoutInvoice = [...paidOrders].filter(id => !invoicedOrders.has(id)).length;
  const expensesPaid = round2(expenses.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0));
  files['resumo_do_mes.csv'] = csv([
    ['Item', 'Valor'],
    ['Período', `${String(m).padStart(2, '0')}/${y}`],
    ['Faturamento recebido (todas as formas)', money(revenue)],
    ...methods.map(k => [`  ${METHOD[k]}`, money(byMethod[k])]),
    ['NFC-e autorizadas (quantidade)', authorized.length],
    ['NFC-e autorizadas (valor)', money(invoiced)],
    ['NFC-e canceladas (quantidade)', cancelled.length],
    ['NFC-e rejeitadas/pendentes', invoices.filter(i => i.status === 'error' || i.status === 'pending').length],
    ['Pedidos pagos sem NFC-e autorizada', withoutInvoice],
    ['Despesas pagas no mês', money(expensesPaid)],
    ...(payroll.length ? [['Folha de pagamento (lançamentos)', money(payroll.reduce((s, p) => s + Number(p.amount), 0))]] : []),
  ]);

  const company = profile?.legal_name || restaurant?.name || 'Restaurante';
  files['LEIAME.txt'] = strToU8([
    `Pacote para o contador - ${String(m).padStart(2, '0')}/${y}`,
    '',
    `Empresa: ${company}${profile?.trade_name ? ` (${profile.trade_name})` : ''}`,
    `CNPJ: ${profile?.cnpj ?? 'não informado'}   IE: ${profile?.state_registration ?? '-'}`,
    `Regime: ${REGIME[profile?.tax_regime ?? ''] ?? profile?.tax_regime ?? '-'}   Cidade: ${profile?.city ?? '-'}/${profile?.state ?? '-'}`,
    `Gerado em: ${brDate(new Date().toISOString())} pelo Oxys Restaurante`,
    '',
    'Conteúdo:',
    '  xml/                     XML das NFC-e autorizadas (canceladas em xml/canceladas)',
    '  notas_fiscais.csv        Todas as notas do mês com situação, chave e valor',
    '  resumo_do_mes.csv        Faturamento, formas de pagamento e totais das notas',
    '  vendas_por_dia.csv       Recebimentos por dia e forma de pagamento',
    '  produtos_vendidos.csv    Produtos vendidos com NCM, CFOP e CSOSN',
    '  despesas.csv             Contas a pagar do mês (vencidas ou pagas no período)',
    ...(payroll.length ? ['  folha_de_pagamento.csv   Lançamentos da folha do mês'] : []),
    '',
    'As planilhas usam ponto e vírgula e abrem direto no Excel.',
    ...(warnings.length ? ['', 'Atenção:', ...warnings.map(w => `  - ${w}`)] : []),
  ].join('\r\n'));

  const zip = zipSync(files, { level: 6 });
  const path = `${rid}/${month}/pacote-contador-${month}-${Date.now()}.zip`;
  const { error: upErr } = await db.storage.from('accountant-packages').upload(path, new Blob([zip], { type: 'application/zip' }), { upsert: false });
  if (upErr) throw new Error(`Não foi possível salvar o pacote: ${upErr.message}`);
  const { data: row, error: insErr } = await db.from('accountant_exports').insert({
    restaurant_id: rid, period: `${month}-01`, file_path: path, file_size: zip.byteLength, invoices_count: invoices.length,
    xml_count: xmlCount, revenue, invoiced, warnings, created_by: userId,
  }).select('*').single();
  if (insErr) throw insErr;
  return { export: row, url: await packageLink(db, path) };
}

export async function packageLink(db: SupabaseClient, path: string) {
  const name = path.split('/').pop()!;
  const { data, error } = await db.storage.from('accountant-packages').createSignedUrl(path, LINK_DAYS * 86400, { download: name });
  if (error || !data) throw new Error('Não foi possível gerar o link do pacote');
  return data.signedUrl;
}
