/** Helpers do módulo fiscal (NFC-e). */

export type FiscalEnvironment = 'homologation' | 'production';
export type TaxRegime = 'simples_nacional' | 'simples_excesso' | 'regime_normal';

export const environmentLabels: Record<FiscalEnvironment, string> = {
  homologation: 'Homologação (testes)',
  production: 'Produção (valor fiscal)',
};

export const taxRegimeLabels: Record<TaxRegime, string> = {
  simples_nacional: 'Simples Nacional',
  simples_excesso: 'Simples Nacional — excesso de sublimite',
  regime_normal: 'Regime Normal (Lucro Presumido/Real)',
};

export const providerLabels: Record<string, string> = {
  focus_nfe: 'Focus NFe',
  plugnotas: 'PlugNotas',
  nuvemfiscal: 'Nuvem Fiscal',
};

/** CSOSN é usado pelo Simples Nacional; CST pelo regime normal. */
export const csosnOptions = [
  { value: '101', label: '101 — Tributada com permissão de crédito' },
  { value: '102', label: '102 — Tributada sem permissão de crédito' },
  { value: '103', label: '103 — Isenção do ICMS para faixa de receita' },
  { value: '300', label: '300 — Imune' },
  { value: '400', label: '400 — Não tributada' },
  { value: '500', label: '500 — ICMS cobrado por substituição tributária' },
  { value: '900', label: '900 — Outros' },
];

export const cstOptions = [
  { value: '00', label: '00 — Tributada integralmente' },
  { value: '20', label: '20 — Com redução de base de cálculo' },
  { value: '40', label: '40 — Isenta' },
  { value: '41', label: '41 — Não tributada' },
  { value: '60', label: '60 — ICMS cobrado por substituição tributária' },
  { value: '90', label: '90 — Outras' },
];

export const originOptions = [
  { value: '0', label: '0 — Nacional' },
  { value: '1', label: '1 — Estrangeira (importação direta)' },
  { value: '2', label: '2 — Estrangeira (mercado interno)' },
  { value: '3', label: '3 — Nacional com mais de 40% de conteúdo importado' },
  { value: '8', label: '8 — Nacional com mais de 70% de conteúdo importado' },
];

export const unitOptions = ['UN', 'KG', 'G', 'L', 'ML', 'PC', 'CX', 'DZ'];

/** Sugestões de NCM comuns em restaurantes — o contador confirma o definitivo. */
export const ncmSuggestions = [
  { value: '21069090', label: '21069090 — Preparações alimentícias (pratos prontos)' },
  { value: '22021000', label: '22021000 — Refrigerantes' },
  { value: '22030000', label: '22030000 — Cervejas' },
  { value: '22011000', label: '22011000 — Águas minerais' },
  { value: '20098900', label: '20098900 — Sucos de frutas' },
  { value: '19059090', label: '19059090 — Produtos de padaria e confeitaria' },
  { value: '18069000', label: '18069000 — Chocolates e sobremesas' },
];

export const isSimples = (regime?: TaxRegime | null) =>
  regime === 'simples_nacional' || regime === 'simples_excesso';

export interface FiscalProfileLike {
  cnpj?: string | null;
  legal_name?: string | null;
  city_code?: string | null;
  state?: string | null;
  csc_id?: string | null;
  certificate_path?: string | null;
  certificate_expires_at?: string | null;
  default_ncm?: string | null;
  default_cfop?: string | null;
  default_csosn?: string | null;
  environment?: FiscalEnvironment | null;
  active?: boolean | null;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  done: boolean;
  hint?: string;
}

/** Só dígitos. */
export const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function isValidCnpj(value?: string | null): boolean {
  const c = onlyDigits(value || '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(c[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export function formatCnpj(value?: string | null): string {
  const c = onlyDigits(value || '').slice(0, 14);
  return c
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Dias restantes até o vencimento do certificado (negativo = vencido). */
export function certificateDaysLeft(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/** Checklist de prontidão para emitir NFC-e. */
export function fiscalReadiness(
  profile: FiscalProfileLike | null | undefined,
  itemsMissingNcm: number,
): ReadinessCheck[] {
  const days = certificateDaysLeft(profile?.certificate_expires_at);
  return [
    {
      key: 'cnpj',
      label: 'CNPJ do emitente válido',
      done: isValidCnpj(profile?.cnpj),
      hint: 'Informe o CNPJ que consta no certificado digital.',
    },
    {
      key: 'address',
      label: 'Endereço fiscal completo',
      done: !!(profile?.city_code && profile?.state),
      hint: 'O código IBGE do município é obrigatório na nota.',
    },
    {
      key: 'certificate',
      label: 'Certificado digital A1 enviado',
      done: !!profile?.certificate_path && (days === null || days > 0),
      hint: days !== null && days <= 0
        ? 'O certificado enviado está vencido.'
        : 'Arquivo .pfx fornecido pela certificadora, válido por 1 ano.',
    },
    {
      key: 'csc',
      label: 'CSC / Token da SEFAZ configurado',
      done: !!profile?.csc_id,
      hint: 'Código de Segurança do Contribuinte, obtido no portal da SEFAZ do seu estado.',
    },
    {
      key: 'defaults',
      label: 'Padrões fiscais definidos (NCM, CFOP, CST/CSOSN)',
      done: !!(profile?.default_ncm && profile?.default_cfop && profile?.default_csosn),
      hint: 'Aplicados automaticamente a todo item sem configuração própria.',
    },
    {
      key: 'items',
      label: itemsMissingNcm > 0
        ? `${itemsMissingNcm} item(ns) sem NCM próprio`
        : 'Itens do cardápio classificados',
      done: itemsMissingNcm === 0 || !!profile?.default_ncm,
      hint: 'Itens sem NCM próprio herdam o padrão do restaurante.',
    },
  ];
}
