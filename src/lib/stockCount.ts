import { brl, downloadCsv } from '@/lib/finance';

/** Balanço de estoque: contagem física comparada com o estoque do sistema. */
export type StockCount = {
  id: string; restaurant_id: string; status: 'scheduled' | 'counting' | 'closed' | 'cancelled'; kind: 'manual' | 'scheduled';
  due_date: string | null; blind_count: boolean; started_at: string | null; closed_at: string | null;
  responsible_name: string | null; responsible_role: string | null; general_notes: string | null; signature: string | null;
  stock_adjusted: boolean; items_total: number; items_divergent: number;
  value_system: number; value_counted: number; value_difference: number; created_at: string;
};
export type StockCountItem = {
  id: string; count_id: string; inventory_id: string | null; name: string; unit: string | null;
  system_quantity: number; cost_per_unit: number; counted_quantity: number | null;
  reason: StockReason | null; justification: string | null; counted_at: string | null;
};

export const STOCK_REASONS = {
  loss: 'Perda / quebra',
  expired: 'Vencimento',
  entry_error: 'Erro de lançamento',
  internal_use: 'Consumo interno',
  theft: 'Furto / desvio',
  unregistered_entry: 'Entrada não registrada',
  other: 'Outro',
} as const;
export type StockReason = keyof typeof STOCK_REASONS;

export const COUNT_STATUS: Record<StockCount['status'], { label: string; tone: string }> = {
  scheduled: { label: 'Agendado', tone: 'border-sky-500/40 text-sky-400' },
  counting: { label: 'Em contagem', tone: 'border-amber-500/40 text-amber-400' },
  closed: { label: 'Concluído', tone: 'border-emerald-500/40 text-emerald-400' },
  cancelled: { label: 'Cancelado', tone: 'border-muted-foreground/40 text-muted-foreground' },
};

export const FREQUENCIES = { none: 'Sem agenda', weekly: 'Toda semana', biweekly: 'A cada 2 semanas', monthly: 'Todo mês' } as const;
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const num = (v: number | null | undefined) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
export const qty = (v: number | null | undefined, unit?: string | null) => (v == null ? '—' : `${num(v)}${unit ? ` ${unit}` : ''}`);
export const diffOf = (i: StockCountItem) => (i.counted_quantity == null ? null : Number(i.counted_quantity) - Number(i.system_quantity));
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
const fileName = (storeName: string, c: StockCount, ext: string) =>
  `balanco-estoque-${storeName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${(c.closed_at ?? c.created_at).slice(0, 10)}.${ext}`;

/** Planilha (abre no Excel). */
export function downloadStockCountCsv(storeName: string, c: StockCount, items: StockCountItem[]) {
  const rows: (string | number)[][] = [
    ['Balanço de estoque', storeName],
    ['Data', date(c.closed_at ?? c.started_at)],
    ['Responsável', `${c.responsible_name ?? ''}${c.responsible_role ? ` (${c.responsible_role})` : ''}`],
    ['Estoque ajustado', c.stock_adjusted ? 'Sim' : 'Não'],
    [],
    ['Item', 'Unidade', 'Sistema', 'Contado', 'Diferença', 'Custo unitário', 'Diferença (R$)', 'Motivo', 'Justificativa'],
    ...items.map(i => {
      const d = diffOf(i);
      return [i.name, i.unit ?? '', num(i.system_quantity), num(i.counted_quantity), d == null ? '' : num(d),
        num(i.cost_per_unit), d == null ? '' : num(d * Number(i.cost_per_unit)), i.reason ? STOCK_REASONS[i.reason] : '', i.justification ?? ''];
    }),
    [],
    ['Itens', c.items_total, 'Com diferença', c.items_divergent],
    ['Valor no sistema', num(c.value_system), 'Valor contado', num(c.value_counted), 'Diferença', num(c.value_difference)],
    ['Observações', c.general_notes ?? ''],
    ['Assinatura', c.signature ?? ''],
  ];
  downloadCsv(fileName(storeName, c, 'csv'), rows);
}

/** Relatório em PDF (arquivo para baixar). */
export async function downloadStockCountPdf(storeName: string, c: StockCount, items: StockCountItem[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Relatório de balanço de estoque', 14, 16);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(storeName, 14, 23);
  doc.text(`Concluído em ${date(c.closed_at)} · Início ${date(c.started_at)}${c.kind === 'scheduled' ? ' · Agendado' : ''}`, 14, 28);
  doc.text(`Responsável: ${c.responsible_name ?? '—'}${c.responsible_role ? ` (${c.responsible_role})` : ''}`, 14, 33);
  doc.text(`Estoque do sistema ${c.stock_adjusted ? 'AJUSTADO para o contado' : 'NÃO ajustado'}`, 14, 38);

  // resumo
  const boxes = [
    ['Itens contados', String(c.items_total)], ['Com diferença', String(c.items_divergent)],
    ['Valor no sistema', brl(Number(c.value_system))], ['Valor contado', brl(Number(c.value_counted))],
    ['Diferença', brl(Number(c.value_difference))],
  ];
  const bw = (W - 28 - 4 * 4) / 5;
  boxes.forEach(([label, value], i) => {
    const x = 14 + i * (bw + 4);
    doc.setDrawColor(210); doc.roundedRect(x, 43, bw, 16, 2, 2);
    doc.setFontSize(8); doc.setTextColor(110); doc.text(label, x + 3, 48);
    doc.setFontSize(12); doc.setTextColor(i === 4 && Number(c.value_difference) < 0 ? 200 : 20, 20, 20); doc.setFont('helvetica', 'bold');
    doc.text(value, x + 3, 55); doc.setFont('helvetica', 'normal'); doc.setTextColor(20);
  });

  autoTable(doc, {
    startY: 64,
    head: [['Item', 'Sistema', 'Contado', 'Diferença', 'Diferença (R$)', 'Motivo', 'Justificativa']],
    body: items.map(i => {
      const d = diffOf(i);
      return [i.name, qty(i.system_quantity, i.unit), qty(i.counted_quantity, i.unit), d == null ? '—' : `${d > 0 ? '+' : ''}${num(d)}`,
        d == null ? '—' : brl(d * Number(i.cost_per_unit)), i.reason ? STOCK_REASONS[i.reason] : '', i.justification ?? ''];
    }),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 30, 30] },
    columnStyles: { 6: { cellWidth: 70 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const it = items[d.row.index];
      const df = diffOf(it);
      if (df && df !== 0 && (d.column.index === 3 || d.column.index === 4)) d.cell.styles.textColor = df < 0 ? [200, 30, 30] : [20, 130, 60];
    },
  });

  // observações e assinatura
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 45) { doc.addPage(); y = 20; }
  doc.setFontSize(10); doc.setTextColor(20);
  doc.setFont('helvetica', 'bold'); doc.text('Observações do responsável', 14, y);
  doc.setFont('helvetica', 'normal');
  const notes = doc.splitTextToSize(c.general_notes || '—', W - 28);
  doc.text(notes, 14, y + 5);
  y += 10 + notes.length * 4.5;
  if (y > H - 25) { doc.addPage(); y = 25; }
  doc.line(14, y + 10, 110, y + 10);
  doc.setFontSize(9);
  doc.text(`Assinatura: ${c.signature ?? ''}`, 14, y + 15);
  doc.text(`${c.responsible_name ?? ''}${c.responsible_role ? ` — ${c.responsible_role}` : ''}`, 14, y + 20);
  doc.setFontSize(7); doc.setTextColor(140);
  doc.text(`Gerado pelo Oxys Restaurante em ${new Date().toLocaleString('pt-BR')}`, 14, H - 6);
  doc.save(fileName(storeName, c, 'pdf'));
}
