// Emissores fiscais. Cada um implementa a mesma interface; o resto do sistema não sabe qual está em uso.
// O emissor da plataforma é escolhido pelo segredo FISCAL_PROVIDER ('simulado' por padrão, ou 'focus').

export type Environment = 'homologation' | 'production';

export type NfceItem = {
  code: string; description: string; ncm: string; cfop: string; unit: string;
  quantity: number; unit_price: number; total: number; tax_code: string; origin: string; other_expenses?: number;
};
export type NfcePayment = { code: string; amount: number };
export type NfceEmitter = {
  cnpj: string; legal_name: string; trade_name: string | null; state_registration: string | null;
  municipal_registration: string | null; tax_regime: string; street: string | null; number: string | null;
  complement: string | null; district: string | null; city: string | null; city_code: string | null;
  state: string | null; zip_code: string | null; phone: string | null; series: number;
};
export type NfceInput = {
  ref: string; restaurantId: string; environment: Environment; emitter: NfceEmitter;
  items: NfceItem[]; payments: NfcePayment[]; change: number; total: number; discount: number;
  consumer: { document: string | null; name: string | null };
};
export type EmitResult =
  | { status: 'authorized'; number: string; series: string; access_key: string; protocol: string;
      authorized_at: string; qrcode_url: string | null; consult_url: string | null; xml_url: string | null;
      pdf_url: string | null; raw: unknown }
  | { status: 'processing'; raw: unknown }
  | { status: 'rejected'; message: string; raw: unknown };

/** Falha que não adianta tentar de novo sem alguém corrigir algo (dados, cadastro). */
export class FiscalRejection extends Error {}

export type CompanyData = NfceEmitter & {
  email: string | null; csc_id: string | null; csc_token: string | null; next_number: number;
};
export type Account = { company_ref: string | null; token_homologation: string | null; token_production: string | null };

export interface FiscalProvider {
  key: string;
  label: string;
  /** true quando o restaurante precisa ser cadastrado no emissor antes de emitir. */
  needsCompanySync: boolean;
  emit(input: NfceInput, ctx: ProviderContext): Promise<EmitResult>;
  consult?(ref: string, environment: Environment, ctx: ProviderContext): Promise<EmitResult>;
  cancel(ref: string, environment: Environment, reason: string, ctx: ProviderContext): Promise<{ protocol: string | null; raw: unknown }>;
  syncCompany?(company: CompanyData, certificate: { base64: string; password: string } | null, account: Account | null):
    Promise<Account>;
}
export type ProviderContext = { account: Account | null; nextNumber: () => Promise<number> };

// ---------- utilitários ----------
const UF_CODES: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export function isValidCnpj(value: string) {
  const c = digits(value);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = 0; i < len; i++) { sum += Number(c[i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** Checagens que a SEFAZ faria, para dar um erro claro antes de enviar. */
export function validateInput(input: NfceInput) {
  const e = input.emitter;
  const problems: string[] = [];
  if (!isValidCnpj(e.cnpj)) problems.push('CNPJ do emitente inválido');
  if (!e.state || !UF_CODES[e.state.toUpperCase()]) problems.push('UF do emitente não informada');
  if (!digits(e.city_code) || digits(e.city_code).length !== 7) problems.push('Código IBGE do município inválido');
  if (!e.legal_name?.trim()) problems.push('Razão social não informada');
  if (!input.items.length) problems.push('Nota sem itens');
  input.items.forEach(i => {
    if (digits(i.ncm).length !== 8) problems.push(`NCM inválido em "${i.description}"`);
    if (digits(i.cfop).length !== 4) problems.push(`CFOP inválido em "${i.description}"`);
  });
  if (!input.payments.length) problems.push('Nota sem forma de pagamento');
  if (problems.length) throw new FiscalRejection(problems.join('; '));
}

function accessKey(uf: string, cnpj: string, series: number, number: number, issued: Date) {
  const aamm = `${String(issued.getFullYear()).slice(2)}${String(issued.getMonth() + 1).padStart(2, '0')}`;
  const cnf = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const base = `${uf}${aamm}${digits(cnpj)}65${String(series).padStart(3, '0')}${String(number).padStart(9, '0')}1${cnf}`;
  let sum = 0, weight = 2;
  for (let i = base.length - 1; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const dv = 11 - (sum % 11);
  return base + (dv >= 10 ? 0 : dv);
}

// ---------- Emissor simulado (só homologação) ----------
// Gera chave de acesso válida, número e protocolo fictícios. Serve para testar o fluxo inteiro
// (fila, caixa, impressão do DANFE) antes de contratar um emissor de verdade.
export const simulatedProvider: FiscalProvider = {
  key: 'simulado',
  label: 'Emissor simulado (testes)',
  needsCompanySync: false,
  async emit(input, ctx) {
    if (input.environment !== 'homologation') {
      throw new FiscalRejection('Nenhum emissor fiscal contratado: o emissor simulado só funciona em homologação (testes).');
    }
    validateInput(input);
    const number = await ctx.nextNumber();
    const now = new Date();
    const uf = UF_CODES[input.emitter.state!.toUpperCase()];
    const key = accessKey(uf, input.emitter.cnpj, input.emitter.series, number, now);
    const protocol = `1${uf}${String(now.getFullYear()).slice(2)}${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`;
    return {
      status: 'authorized', number: String(number), series: String(input.emitter.series), access_key: key, protocol,
      authorized_at: now.toISOString(),
      qrcode_url: `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${key}|2|2|1|SIMULADO`,
      consult_url: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
      xml_url: null, pdf_url: null, raw: { simulated: true },
    };
  },
  async cancel() {
    return { protocol: `SIM${Date.now()}`, raw: { simulated: true } };
  },
};

// ---------- Focus NFe ----------
// Documentação: https://doc.focusnfe.com.br  (ainda não testado com conta real)
const FOCUS_MASTER_TOKEN = Deno.env.get('FOCUS_NFE_TOKEN') ?? '';
const focusHost = (env: Environment) => (env === 'production' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br');
const basic = (token: string) => `Basic ${btoa(`${token}:`)}`;
const REGIME: Record<string, number> = { simples_nacional: 1, simples_excesso: 2, regime_normal: 3 };

async function focusFetch(url: string, token: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: basic(token), 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  } catch (e) {
    throw new Error(`Sem conexão com o emissor: ${e instanceof Error ? e.message : e}`); // tenta de novo
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { mensagem: text }; }
  if (res.status >= 500) throw new Error(`Emissor indisponível (${res.status})`); // tenta de novo
  return { status: res.status, body };
}

function focusResult(body: any): EmitResult {
  const st = body?.status;
  if (st === 'autorizado') {
    return {
      status: 'authorized', number: String(body.numero ?? ''), series: String(body.serie ?? ''),
      access_key: String(body.chave_nfe ?? '').replace(/^NFe/, ''), protocol: String(body.protocolo ?? ''),
      authorized_at: new Date().toISOString(), qrcode_url: body.qrcode_url ?? null, consult_url: body.url_consulta_nf ?? null,
      xml_url: body.caminho_xml_nota_fiscal ? `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}` : null,
      pdf_url: body.caminho_danfe ? `https://api.focusnfe.com.br${body.caminho_danfe}` : null, raw: body,
    };
  }
  if (st === 'processando_autorizacao') return { status: 'processing', raw: body };
  return { status: 'rejected', message: String(body?.mensagem_sefaz || body?.mensagem || body?.codigo || 'Nota rejeitada'), raw: body };
}

function companyToken(ctx: ProviderContext, env: Environment) {
  const t = env === 'production' ? ctx.account?.token_production : ctx.account?.token_homologation;
  if (!t) throw new FiscalRejection('Restaurante ainda não cadastrado no emissor. Em Configurações → Configuração fiscal, clique em "Enviar ao emissor".');
  return t;
}

export const focusProvider: FiscalProvider = {
  key: 'focus',
  label: 'Focus NFe',
  needsCompanySync: true,
  async emit(input, ctx) {
    validateInput(input);
    const token = companyToken(ctx, input.environment);
    const body = {
      cnpj_emitente: digits(input.emitter.cnpj),
      data_emissao: new Date().toISOString(),
      natureza_operacao: 'VENDA AO CONSUMIDOR',
      presenca_comprador: 1,
      modalidade_frete: 9,
      local_destino: 1,
      ...(input.consumer.document
        ? digits(input.consumer.document).length === 14
          ? { cnpj_destinatario: digits(input.consumer.document) }
          : { cpf_destinatario: digits(input.consumer.document) }
        : {}),
      ...(input.consumer.name && input.consumer.document ? { nome_destinatario: input.consumer.name } : {}),
      valor_desconto: input.discount || undefined,
      items: input.items.map((i, idx) => ({
        numero_item: idx + 1, codigo_produto: i.code, descricao: i.description, cfop: i.cfop,
        unidade_comercial: i.unit, quantidade_comercial: i.quantity, valor_unitario_comercial: i.unit_price,
        valor_bruto: i.total, unidade_tributavel: i.unit, quantidade_tributavel: i.quantity, valor_unitario_tributavel: i.unit_price,
        codigo_ncm: digits(i.ncm), icms_origem: Number(i.origin), icms_situacao_tributaria: i.tax_code,
        ...(i.other_expenses ? { valor_outras_despesas: i.other_expenses } : {}),
      })),
      formas_pagamento: input.payments.map(p => ({ forma_pagamento: p.code, valor_pagamento: p.amount })),
      ...(input.change > 0 ? { valor_troco: input.change } : {}),
    };
    const res = await focusFetch(`${focusHost(input.environment)}/v2/nfce?ref=${encodeURIComponent(input.ref)}`, token,
      { method: 'POST', body: JSON.stringify(body) });
    // Referência já usada (reenvio): consulta o que aconteceu com ela.
    if (res.body?.codigo === 'already_processed' || res.body?.codigo === 'nfe_autorizada') {
      return this.consult!(input.ref, input.environment, ctx);
    }
    if (res.status >= 400 && !res.body?.status) {
      return { status: 'rejected', message: String(res.body?.mensagem || `Erro ${res.status} no emissor`), raw: res.body };
    }
    return focusResult(res.body);
  },
  async consult(ref, environment, ctx) {
    const res = await focusFetch(`${focusHost(environment)}/v2/nfce/${encodeURIComponent(ref)}?completa=1`, companyToken(ctx, environment));
    return focusResult(res.body);
  },
  async cancel(ref, environment, reason, ctx) {
    const res = await focusFetch(`${focusHost(environment)}/v2/nfce/${encodeURIComponent(ref)}`, companyToken(ctx, environment),
      { method: 'DELETE', body: JSON.stringify({ justificativa: reason }) });
    if (res.body?.status !== 'cancelado') {
      throw new FiscalRejection(String(res.body?.mensagem_sefaz || res.body?.mensagem || 'A SEFAZ não aceitou o cancelamento'));
    }
    return { protocol: res.body?.protocolo ?? null, raw: res.body };
  },
  async syncCompany(company, certificate, account) {
    if (!FOCUS_MASTER_TOKEN) throw new FiscalRejection('Token da Focus NFe (FOCUS_NFE_TOKEN) não configurado na plataforma.');
    const body: Record<string, unknown> = {
      nome: company.legal_name, nome_fantasia: company.trade_name || company.legal_name, cnpj: digits(company.cnpj),
      inscricao_estadual: digits(company.state_registration) || undefined,
      inscricao_municipal: digits(company.municipal_registration) || undefined,
      regime_tributario: REGIME[company.tax_regime] ?? 1,
      logradouro: company.street, numero: company.number, complemento: company.complement, bairro: company.district,
      municipio: company.city, uf: company.state, cep: digits(company.zip_code), telefone: digits(company.phone) || undefined,
      email: company.email || undefined,
      habilita_nfce: true,
      csc_nfce_producao: company.csc_token || undefined, id_token_nfce_producao: company.csc_id || undefined,
      csc_nfce_homologacao: company.csc_token || undefined, id_token_nfce_homologacao: company.csc_id || undefined,
      serie_nfce_producao: company.series, serie_nfce_homologacao: company.series,
      proximo_numero_nfce_producao: company.next_number, proximo_numero_nfce_homologacao: company.next_number,
      ...(certificate ? { arquivo_certificado_base64: certificate.base64, senha_certificado: certificate.password } : {}),
    };
    const url = account?.company_ref
      ? `https://api.focusnfe.com.br/v2/empresas/${account.company_ref}`
      : 'https://api.focusnfe.com.br/v2/empresas';
    const res = await focusFetch(url, FOCUS_MASTER_TOKEN, { method: account?.company_ref ? 'PUT' : 'POST', body: JSON.stringify(body) });
    if (res.status >= 400) {
      const errs = Array.isArray(res.body?.erros) ? res.body.erros.map((e: any) => e.mensagem).join('; ') : '';
      throw new FiscalRejection(`Focus NFe recusou o cadastro: ${errs || res.body?.mensagem || res.status}`);
    }
    return {
      company_ref: String(res.body.id ?? account?.company_ref ?? ''),
      token_homologation: res.body.token_homologacao ?? account?.token_homologation ?? null,
      token_production: res.body.token_producao ?? account?.token_production ?? null,
    };
  },
};

export function currentProvider(): FiscalProvider {
  return (Deno.env.get('FISCAL_PROVIDER') ?? 'simulado') === 'focus' ? focusProvider : simulatedProvider;
}
