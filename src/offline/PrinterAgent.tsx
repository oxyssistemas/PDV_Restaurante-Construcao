import { useEffect, useRef, useState } from 'react';
import { renderOrderTicket, renderReceipt, type PrinterConfig } from '@/lib/printing';
import { api, subscribe, type HubState, type PrintJobView } from './api';

type Printer = HubState['printers'][number];
type Desktop = { printHtml: (html: string, options?: { deviceName?: string }) => Promise<void> };

const config = (p: Printer | null, purpose: 'kitchen' | 'receipt'): PrinterConfig => ({
  purpose, enabled: true, model: 'generic', device_name: null, width: p?.width ?? '80mm', copies: p?.copies ?? 1,
  header_note: p?.header_note ?? null, footer_note: p?.footer_note ?? null,
});

/**
 * Janela escondida da central (aberta pelo app de computador): imprime as vias feitas sem internet
 * direto nas impressoras deste computador, na impressora escolhida para cada setor na Estação de impressão.
 */
export default function PrinterAgent() {
  const [log, setLog] = useState<string[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    const desktop = (window as unknown as { oxysDesktop?: Desktop }).oxysDesktop;
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { jobs, restaurant, printers, devices } = await api.prints();
        for (const job of jobs) {
          try {
            if (!desktop) throw new Error('Impressão disponível só no app de computador');
            await printJob(desktop, job, restaurant?.name ?? 'Restaurante', printers, devices);
            await api.printed(job.id);
            setLog(l => [`${new Date().toLocaleTimeString('pt-BR')} ${job.kind} ok`, ...l].slice(0, 30));
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'falhou';
            await api.printed(job.id, msg);
            setLog(l => [`${new Date().toLocaleTimeString('pt-BR')} ${job.kind} erro: ${msg}`, ...l].slice(0, 30));
          }
        }
      } catch { /* central reiniciando */ } finally { busy.current = false; }
    };
    run();
    const stop = subscribe(() => run());
    const t = setInterval(run, 5000);
    return () => { stop(); clearInterval(t); };
  }, []);

  return <pre className="p-4 text-xs">{log.join('\n') || 'Aguardando vias para imprimir...'}</pre>;
}

async function printJob(desktop: Desktop, job: PrintJobView, restaurantName: string, printers: Printer[], devices: Record<string, string>) {
  const purpose = job.kind;
  // Impressoras cadastradas para o setor; sem nenhuma, vai para a padrão do computador.
  const targets: (Printer | null)[] = printers.filter(p => p.purposes.includes(purpose));
  if (!targets.length) targets.push(null);
  const order = {
    id: job.order.id, created_at: job.order.created_at, customer_name: job.order.customer_name, customer_phone: job.order.customer_phone,
    customer_address: job.order.customer_address, table_number: job.table?.number ?? null, order_type: job.order.order_type,
    total: job.order.total, created_by_name: job.order.created_by_name,
  };
  const items = job.items.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, notes: i.notes }));
  for (const p of targets) {
    const html = purpose === 'kitchen'
      ? renderOrderTicket({ restaurantName, order, items, title: 'Via da cozinha', showPrices: false, config: config(p, 'kitchen') })
      : renderReceipt({
          restaurantName, order, items, config: config(p, 'receipt'),
          payments: job.order.payments.map(x => ({ method: x.method, amount: Number(x.amount) })),
          change: job.order.payments.reduce((s, x) => s + Number(x.change_amount || 0), 0),
        });
    await desktop.printHtml(html, { deviceName: p ? devices[p.id] : undefined });
  }
}
