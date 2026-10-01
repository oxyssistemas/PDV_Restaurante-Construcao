import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { printHtml } from '@/lib/printing';
import { loadStation, PRINTER_COLUMNS, renderJob, type PrintJob, type Printer, type StationConfig } from '@/lib/printQueue';

/** Trabalhos mais antigos que isso não saem sozinhos (ex.: estação ficou desligada); dá para imprimir pela tela. */
const MAX_AUTO_AGE_MS = 60 * 60_000;

export type StationActivity = { online: boolean; lastPrintedAt: string | null; lastError: string | null; printing: boolean };

let lastActivity: StationActivity = { online: false, lastPrintedAt: null, lastError: null, printing: false };
/** Último estado conhecido da estação (para telas que abrem depois). */
export const getStationActivity = () => lastActivity;

/**
 * Transforma este navegador numa estação de impressão quando ele tem impressoras atribuídas
 * (tela Estação de impressão). Fica montado no app inteiro, então funciona com qualquer
 * portal aberto (cozinha, caixa...).
 */
export default function PrintStationRunner() {
  const { currentRole, user } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const [station, setStation] = useState<StationConfig | null>(() => loadStation(restaurantId));
  const printers = useRef<Record<string, Printer>>({});
  const busy = useRef(false);
  const pending = useRef(false);
  const publish = (patch: Partial<StationActivity>) => {
    lastActivity = { ...lastActivity, ...patch };
    window.dispatchEvent(new CustomEvent('oxys:print-activity', { detail: lastActivity }));
  };

  useEffect(() => {
    const reload = () => setStation(loadStation(restaurantId));
    reload();
    window.addEventListener('oxys:print-station', reload);
    window.addEventListener('storage', reload);
    return () => { window.removeEventListener('oxys:print-station', reload); window.removeEventListener('storage', reload); };
  }, [restaurantId]);

  const active = !!user && !!station && station.printerIds.length > 0;

  const drain = useCallback(async () => {
    if (!station || !active) return;
    if (busy.current) { pending.current = true; return; }
    busy.current = true;
    try {
      do {
        pending.current = false;
        const { data: list } = await supabase.from('printers').select(PRINTER_COLUMNS).in('id', station.printerIds);
        printers.current = Object.fromEntries(((list || []) as Printer[]).map(p => [p.id, p]));
        const since = new Date(Date.now() - MAX_AUTO_AGE_MS).toISOString();
        const { data: jobs } = await supabase.from('print_jobs')
          .select('id').in('printer_id', station.printerIds).eq('status', 'queued').gte('created_at', since)
          .order('created_at').limit(20);
        for (const { id } of jobs || []) {
          const { data: claimed } = await supabase.rpc('claim_print_job', { _job_id: id, _station: station.id });
          const job = (claimed as unknown as PrintJob[] | null)?.[0];
          if (!job) continue; // outra estação pegou
          const printer = printers.current[job.printer_id];
          try {
            if (!printer || !printer.enabled) throw new Error('Impressora desativada');
            publish({ printing: true });
            await printHtml(renderJob(job.document, printer));
            await supabase.from('print_jobs').update({ status: 'done', printed_at: new Date().toISOString(), error: null }).eq('id', job.id);
            publish({ printing: false, lastPrintedAt: new Date().toISOString(), lastError: null });
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Falha ao imprimir';
            await supabase.from('print_jobs').update({ status: 'error', error: message }).eq('id', job.id);
            publish({ printing: false, lastError: message });
          }
        }
      } while (pending.current);
    } finally {
      busy.current = false;
    }
  }, [station, active]);

  useEffect(() => {
    if (!active || !restaurantId) { publish({ online: false }); return; }
    const channel = supabase.channel(`print-station-${station!.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs', filter: `restaurant_id=eq.${restaurantId}` },
        payload => {
          const row = payload.new as Partial<PrintJob>;
          if (row?.status === 'queued' && row.printer_id && station!.printerIds.includes(row.printer_id)) drain();
        })
      .subscribe(status => {
        publish({ online: status === 'SUBSCRIBED' });
        if (status === 'SUBSCRIBED') drain();
      });
    // Rede para o caso de algum evento em tempo real se perder.
    const timer = setInterval(drain, 15_000);
    return () => { clearInterval(timer); supabase.removeChannel(channel); publish({ online: false }); };
  }, [active, restaurantId, station, drain]);

  return null;
}
