import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  renderNfce, renderOrderTicket, renderReceipt, type NfceDocument, type PrintItem, type PrintOrder, type PrintPayment,
  type PrinterConfig, type ThermalWidth,
} from '@/lib/printing';

/** Para que serve cada impressora. 'test' é só para a página de teste. */
export type JobPurpose = 'kitchen' | 'order' | 'receipt' | 'nfce';
export type Connection = 'browser' | 'agent' | 'cloudprnt' | 'epson_sdp';

export type Printer = {
  id: string; restaurant_id: string; name: string; connection: Connection; purposes: JobPurpose[];
  auto_print: boolean; enabled: boolean; model: string; width: ThermalWidth; copies: number;
  address: string | null; header_note: string | null; footer_note: string | null; last_seen_at: string | null;
};
export const PRINTER_COLUMNS =
  'id, restaurant_id, name, connection, purposes, auto_print, enabled, model, width, copies, address, header_note, footer_note, last_seen_at';

export type PrintDocument =
  | { kind: 'kitchen' | 'order'; restaurant_name: string; order: PrintOrder; items: PrintItem[] }
  | { kind: 'receipt'; restaurant_name: string; order: PrintOrder; items: PrintItem[]; payments: PrintPayment[]; change?: number }
  | ({ kind: 'nfce' } & NfceDocument)
  | { kind: 'test'; restaurant_name: string; printer_name: string };

export type PrintJob = {
  id: string; restaurant_id: string; printer_id: string; purpose: string; document: PrintDocument;
  status: 'queued' | 'printing' | 'done' | 'error' | 'cancelled'; attempts: number; claimed_by: string | null;
  printed_at: string | null; error: string | null; created_at: string;
};

export const PURPOSE_LABELS: Record<JobPurpose, string> = {
  kitchen: 'Via da cozinha',
  order: 'Comanda / conferência',
  receipt: 'Recibo de pagamento',
  nfce: 'Nota fiscal (DANFE NFC-e)',
};
export const PURPOSE_AUTO_HINT: Record<JobPurpose, string> = {
  kitchen: 'imprime sozinho a cada pedido enviado para a cozinha',
  order: 'só sob demanda',
  receipt: 'imprime sozinho quando a conta é quitada',
  nfce: 'imprime sozinho quando a nota é autorizada',
};
export const JOB_PURPOSES: JobPurpose[] = ['kitchen', 'order', 'receipt', 'nfce'];

export const CONNECTIONS: Record<Connection, { label: string; description: string; available: boolean }> = {
  browser: {
    label: 'Estação no navegador',
    description: 'Um computador com a impressora instalada (USB ou rede) deixa a tela "Estação de impressão" aberta no Chrome.',
    available: true,
  },
  agent: {
    label: 'Agente local',
    description: 'Programa instalado em qualquer PC do restaurante que envia direto para impressoras de rede ou USB.',
    available: false,
  },
  cloudprnt: {
    label: 'Star CloudPRNT',
    description: 'Impressoras Star com CloudPRNT buscam os cupons sozinhas, sem computador.',
    available: false,
  },
  epson_sdp: {
    label: 'Epson Server Direct Print',
    description: 'Impressoras Epson compatíveis buscam os cupons sozinhas, sem computador.',
    available: false,
  },
};

export const STATUS_LABELS: Record<PrintJob['status'], string> = {
  queued: 'Na fila',
  printing: 'Imprimindo',
  done: 'Impresso',
  error: 'Erro',
  cancelled: 'Cancelado',
};

export const printerConfig = (p: Printer): PrinterConfig => ({
  purpose: 'kitchen', enabled: p.enabled, model: p.model, device_name: null, width: p.width,
  copies: p.copies, header_note: p.header_note, footer_note: p.footer_note,
});

/** HTML do trabalho para a impressora informada. */
export async function renderJob(doc: PrintDocument, printer: Printer): Promise<string> {
  const config = printerConfig(printer);
  switch (doc.kind) {
    case 'kitchen':
      return renderOrderTicket({ restaurantName: doc.restaurant_name, order: doc.order, items: doc.items, title: 'Via da cozinha', showPrices: false, config });
    case 'order':
      return renderOrderTicket({ restaurantName: doc.restaurant_name, order: doc.order, items: doc.items, config });
    case 'receipt':
      return renderReceipt({ restaurantName: doc.restaurant_name, order: doc.order, items: doc.items, payments: doc.payments, change: doc.change, config });
    case 'nfce':
      return renderNfce(doc, config);
    case 'test':
      return renderOrderTicket({
        restaurantName: doc.restaurant_name,
        title: `Teste • ${doc.printer_name}`,
        order: { id: crypto.randomUUID(), created_at: new Date().toISOString(), order_type: 'dine_in', table_number: 1, created_by_name: 'Teste de impressão' },
        items: [{ name: 'Item de exemplo', quantity: 1, unit_price: 10, notes: 'Impressão funcionando' }],
        config,
      });
  }
}

/** Coloca um trabalho na fila de uma impressora específica. */
export async function enqueueJob(printer: Printer, purpose: JobPurpose | 'test', document: PrintDocument, orderId?: string | null) {
  const { error } = await supabase.from('print_jobs').insert({
    restaurant_id: printer.restaurant_id, printer_id: printer.id, purpose, document: document as unknown as Json, order_id: orderId ?? null,
  });
  if (error) throw error;
}

/** Devolve um trabalho para a fila (reimprimir). */
export async function requeueJob(jobId: string) {
  const { error } = await supabase.from('print_jobs')
    .update({ status: 'queued', error: null, claimed_by: null, claimed_at: null }).eq('id', jobId);
  if (error) throw error;
}

// ---------- Estação de impressão (este navegador) ----------
const STATION_KEY = 'oxys.printStation';
export type StationConfig = { id: string; restaurantId: string; printerIds: string[] };

export function loadStation(restaurantId: string | null | undefined): StationConfig | null {
  if (!restaurantId) return null;
  try {
    const raw = localStorage.getItem(STATION_KEY);
    const s = raw ? (JSON.parse(raw) as StationConfig) : null;
    return s && s.restaurantId === restaurantId ? s : null;
  } catch {
    return null;
  }
}

export function saveStation(restaurantId: string, printerIds: string[]) {
  const current = loadStation(restaurantId);
  const station: StationConfig = { id: current?.id ?? crypto.randomUUID(), restaurantId, printerIds };
  try {
    localStorage.setItem(STATION_KEY, JSON.stringify(station));
  } catch { /* navegador sem armazenamento: a estação vale só nesta aba */ }
  window.dispatchEvent(new Event('oxys:print-station'));
  return station;
}
