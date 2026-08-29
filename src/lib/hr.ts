export const sectorLabels: Record<string, string> = {
  cozinha: 'Cozinha',
  salao: 'Salão',
  caixa: 'Caixa',
  entrega: 'Entrega',
  admin: 'Administrativo',
  limpeza: 'Limpeza',
};

export const contractLabels: Record<string, string> = {
  clt: 'CLT',
  pj: 'PJ',
  diarista: 'Diarista',
  extra: 'Extra / Freela',
  estagio: 'Estágio',
};

export const payrollTypeLabels: Record<string, string> = {
  salary: 'Salário',
  advance: 'Adiantamento',
  voucher: 'Vale',
  overtime: 'Hora extra',
  bonus: 'Bonificação',
  tip: 'Gorjeta',
  discount: 'Desconto',
};

/** Tipos que reduzem o valor da folha. */
export const negativePayrollTypes = ['discount'];

export const payrollStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

export function shiftHours(start: string, end: string, breakMinutes = 0) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  mins -= breakMinutes;
  return Math.max(0, mins) / 60;
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthLabel(iso: string) {
  const [y, m] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
