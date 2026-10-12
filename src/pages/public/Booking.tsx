import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarCheck, CheckCircle2, Loader2, Minus, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type Info = {
  name: string; online_enabled: boolean; waitlist_online: boolean; hours: Record<string, [string, string]>;
  min_party: number; max_party: number; advance_days: number; notice: string | null; duration_minutes: number; today: string;
};

export async function callBooking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-booking', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** Página pública: reservar mesa ou entrar na fila de espera pelo celular. */
export default function Booking() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'book' | 'queue'>('book');
  const [party, setParty] = useState(2);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState<{ table: number; end: string } | null>(null);

  const { data: info, isLoading, error } = useQuery({
    queryKey: ['booking-info', slug], retry: false,
    queryFn: () => callBooking<Info>({ action: 'info', slug }),
  });
  useEffect(() => {
    if (!info) return;
    document.title = `${info.name} · Reservas`;
    if (!info.online_enabled && info.waitlist_online) setTab('queue');
    if (!date) setDate(info.today);
  }, [info, date]);

  const { data: slots, isFetching } = useQuery({
    queryKey: ['booking-slots', slug, date, party],
    enabled: !!info?.online_enabled && !!date && tab === 'book',
    queryFn: () => callBooking<{ slots: string[] }>({ action: 'slots', slug, date, party }),
  });
  useEffect(() => { setTime(''); }, [date, party]);

  const book = useMutation({
    mutationFn: () => callBooking<{ table: number; end: string }>({ action: 'book', slug, date, time, party, name, phone, notes }),
    onSuccess: r => setDone(r),
  });
  const join = useMutation({
    mutationFn: () => callBooking<{ token: string }>({ action: 'queue_join', slug, name, phone, party }),
    onSuccess: r => navigate(`/fila/${r.token}`),
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !info) return <main className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Página não encontrada.</main>;

  const days = Array.from({ length: Math.min(info.advance_days, 13) + 1 }, (_, i) => addDays(info.today, i))
    .filter(d => !!info.hours[String(new Date(`${d}T12:00:00Z`).getUTCDay())]);
  const okContact = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10;

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-5 bg-background p-4 pb-16">
      <header className="pt-4 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-2 text-2xl font-bold">{info.name}</h1>
        {info.notice && <p className="mt-1 text-sm text-muted-foreground">{info.notice}</p>}
      </header>

      {done ? (
        <div className="space-y-3 rounded-2xl border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[hsl(var(--success))]" />
          <p className="text-lg font-semibold">Reserva confirmada!</p>
          <p className="text-sm">{dayLabel(date)} às {time} · {party} pessoa(s) · mesa {done.table}</p>
          <p className="text-xs text-muted-foreground">Sua mesa fica reservada até {done.end}. Até lá!</p>
        </div>
      ) : (
        <>
          {info.online_enabled && info.waitlist_online && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {([['book', 'Reservar mesa'], ['queue', 'Entrar na fila agora']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
                  className={cn('rounded-lg py-2 text-sm font-medium', tab === k ? 'bg-background shadow' : 'text-muted-foreground')}>{l}</button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border p-3">
            <span className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Pessoas</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Menos pessoas" onClick={() => setParty(p => Math.max(info.min_party, p - 1))}><Minus className="h-4 w-4" /></Button>
              <span className="w-8 text-center text-lg font-bold">{party}</span>
              <Button size="icon" variant="outline" aria-label="Mais pessoas" onClick={() => setParty(p => Math.min(tab === 'book' ? info.max_party : 50, p + 1))}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {tab === 'book' && (
            <>
              <div className="space-y-2">
                <Label>Dia</Label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map(d => (
                    <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={date === d}
                      className={cn('shrink-0 rounded-xl border px-3 py-2 text-sm capitalize', date === d ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}>
                      {dayLabel(d)}
                    </button>
                  ))}
                  {!days.length && <p className="text-sm text-muted-foreground">Sem dias com reserva nos próximos dias.</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                {isFetching ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : slots?.slots.length ? (
                  <div className="grid grid-cols-4 gap-2">
                    {slots.slots.map(t => (
                      <button key={t} type="button" onClick={() => setTime(t)} aria-pressed={time === t}
                        className={cn('rounded-xl border py-2 text-sm', time === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}>{t}</button>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sem horários livres para {party} pessoa(s) nesse dia.</p>}
              </div>
            </>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="bk-name">Seu nome</Label><Input id="bk-name" autoComplete="name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-phone">WhatsApp</Label><Input id="bk-phone" inputMode="tel" autoComplete="tel" placeholder="(43) 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            {tab === 'book' && <div className="space-y-1.5"><Label htmlFor="bk-notes">Observação (opcional)</Label><Input id="bk-notes" maxLength={300} placeholder="Ex.: aniversário, cadeira de bebê" value={notes} onChange={e => setNotes(e.target.value)} /></div>}
          </div>

          {(book.error || join.error) && <p className="text-sm text-destructive">{((book.error || join.error) as Error).message}</p>}
          {tab === 'book' ? (
            <Button size="lg" className="w-full" disabled={!time || !okContact || book.isPending} onClick={() => book.mutate()}>
              {book.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar reserva
            </Button>
          ) : (
            <Button size="lg" className="w-full" disabled={!okContact || join.isPending} onClick={() => join.mutate()}>
              {join.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar na fila
            </Button>
          )}
        </>
      )}
    </main>
  );
}
