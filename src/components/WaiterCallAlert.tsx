import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, ReceiptText, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Call = { id: string; type: string; title: string; message: string; table_id: string | null; created_at: string };

const CALL_TYPES = ['waiter_call', 'bill_request'];

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i % 2 ? 1180 : 880;
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.16);
    });
  } catch { /* navegador sem som liberado */ }
}

/**
 * Pop-up do garçom: mesa que chamou pelo QR/tablet (ou pediu a conta). Toca um aviso e fica na tela até
 * alguém responder "Estou indo" — aí some para os outros garçons também.
 */
export default function WaiterCallAlert({ restaurantId }: { restaurantId?: string | null }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const dismissed = useRef(new Set<string>());
  const navigate = useNavigate();
  const qc = useQueryClient();

  const add = useCallback((n: Call & { read?: boolean; target_roles?: string[] | null }) => {
    if (!CALL_TYPES.includes(n.type) || n.read || !(n.target_roles ?? []).includes('waiter') || dismissed.current.has(n.id)) return;
    setCalls(prev => prev.some(c => c.id === n.id) ? prev : [...prev, n]);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    // chamados dos últimos 15 min ainda sem resposta
    supabase.from('notifications').select('id, type, title, message, table_id, created_at, read, target_roles')
      .eq('restaurant_id', restaurantId).in('type', CALL_TYPES).eq('read', false)
      .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString()).order('created_at')
      .then(({ data }) => (data ?? []).forEach(n => add(n as Call)));

    const channel = supabase.channel(`waiter-calls-${restaurantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `restaurant_id=eq.${restaurantId}` }, (p) => {
        const n = p.new as Call & { read?: boolean; target_roles?: string[] };
        if (CALL_TYPES.includes(n.type) && (n.target_roles ?? []).includes('waiter')) beep();
        add(n);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `restaurant_id=eq.${restaurantId}` }, (p) => {
        const n = p.new as { id: string; read?: boolean };
        if (n.read) setCalls(prev => prev.filter(c => c.id !== n.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, add]);

  const answer = async (c: Call) => {
    dismissed.current.add(c.id);
    setCalls(prev => prev.filter(x => x.id !== c.id));
    await supabase.from('notifications').update({ read: true }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['waiter-table-alerts'] });
  };

  const hide = (c: Call) => {
    dismissed.current.add(c.id);
    setCalls(prev => prev.filter(x => x.id !== c.id));
  };

  const openTable = async (c: Call) => {
    await answer(c);
    if (!c.table_id) return;
    const { data } = await supabase.from('orders').select('id').eq('table_id', c.table_id)
      .in('status', ['pending', 'preparing', 'ready']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    navigate(data ? `/waiter/orders/${data.id}` : '/waiter');
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="assertive">
      <AnimatePresence>
        {calls.slice(-3).map(c => {
          const bill = c.type === 'bill_request';
          const Icon = bill ? ReceiptText : BellRing;
          return (
            <motion.div key={c.id} role="alertdialog" aria-label={c.title}
              initial={{ opacity: 0, y: -24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }}
              className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-primary bg-card p-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <motion.div animate={{ rotate: [0, -14, 14, -10, 10, 0] }} transition={{ repeat: Infinity, repeatDelay: 1.2, duration: 0.7 }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{c.title}</p>
                  <p className="text-sm text-muted-foreground">{c.message}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Fechar aviso" onClick={() => hide(c)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => openTable(c)}>Abrir mesa</Button>
                <Button className="rounded-xl" onClick={() => answer(c)}>Estou indo</Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
