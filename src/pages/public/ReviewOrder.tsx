import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, MessageSquareHeart, ReceiptText, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type ReviewInfo = {
  code: string; created_at: string; order_type: string | null; customer_name: string | null;
  restaurant: string; logo: string | null; enabled: boolean; thank_you: string | null;
  review: { score: number; comment: string | null; reply: string | null } | null;
  items: { name: string; quantity: number }[];
};

async function callReview<T>(body: Record<string, unknown>): Promise<T> {
  // loja com servidor dedicado: o link traz ?r=<loja> e a nuvem repassa para o servidor dela
  const r = new URLSearchParams(window.location.search).get('r');
  if (r) body = { ...body, r };
  const { data, error } = await supabase.functions.invoke('order-review', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

const scoreTone = (n: number) => (n <= 6 ? 'bg-red-500' : n <= 8 ? 'bg-amber-500' : 'bg-emerald-500');

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" aria-label={`${label}: ${n} de 5`} onClick={() => onChange(n === value ? 0 : n)}>
            <Star className={cn('h-6 w-6', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Página pública: o cliente dá a nota (NPS 0–10) do pedido, pelo link/QR do recibo ou do acompanhamento. */
export default function ReviewOrder() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const [score, setScore] = useState<number | null>(null);
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    document.body.classList.add('store-theme');
    return () => document.body.classList.remove('store-theme');
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['review', token],
    retry: false,
    queryFn: () => callReview<ReviewInfo>({ action: 'get', token }),
  });

  const send = useMutation({
    mutationFn: () => callReview({ action: 'submit', token, score, comment, food: food || null, service: service || null, speed: speed || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review', token] }),
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <ReceiptText className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Pedido não encontrado</h1>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex flex-col items-center gap-2 text-center">
          {data.logo ? <img src={data.logo} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <MessageSquareHeart className="h-12 w-12 text-primary" />}
          <h1 className="text-2xl font-bold">{data.restaurant}</h1>
          <p className="text-sm text-muted-foreground">
            Pedido #{data.code} · {new Date(data.created_at).toLocaleDateString('pt-BR')}
          </p>
          {!!data.items.length && (
            <p className="text-xs text-muted-foreground">{data.items.map(i => `${i.quantity}x ${i.name}`).join(' · ')}</p>
          )}
        </header>

        {data.review ? (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold">Obrigado pela avaliação!</h2>
            <p className="text-sm text-muted-foreground">{data.thank_you || 'Sua opinião ajuda a gente a melhorar a cada pedido.'}</p>
            <p className="text-sm">Sua nota: <b>{data.review.score}</b></p>
            {data.review.comment && <p className="text-sm italic text-muted-foreground">“{data.review.comment}”</p>}
            {data.review.reply && (
              <div className="rounded-xl bg-muted/40 p-3 text-left text-sm">
                <div className="mb-1 text-xs font-semibold text-primary">Resposta de {data.restaurant}</div>
                {data.review.reply}
              </div>
            )}
          </section>
        ) : !data.enabled ? (
          <p className="text-center text-sm text-muted-foreground">Esta loja não está recebendo avaliações no momento.</p>
        ) : (
          <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-3">
              <h2 className="text-center font-semibold">De 0 a 10, quanto você recomendaria a gente para um amigo?</h2>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, n) => (
                  <button key={n} type="button" onClick={() => setScore(n)} aria-pressed={score === n}
                    className={cn('aspect-square rounded-lg border text-sm font-semibold transition-colors',
                      score === n ? `${scoreTone(n)} border-transparent text-white` : 'border-border hover:border-primary/50')}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground"><span>Nada provável</span><span>Muito provável</span></div>
            </div>

            {score !== null && (
              <>
                <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                  <Stars label="Comida" value={food} onChange={setFood} />
                  <Stars label="Atendimento" value={service} onChange={setService} />
                  <Stars label="Tempo de espera" value={speed} onChange={setSpeed} />
                </div>
                <Textarea rows={3} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder={score <= 6 ? 'O que deu errado? Conte pra gente.' : 'Quer deixar um comentário? (opcional)'} />
                {send.error && <p className="text-sm text-destructive">{(send.error as Error).message}</p>}
                <Button className="h-12 w-full rounded-xl text-base" disabled={send.isPending} onClick={() => send.mutate()}>
                  {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar avaliação
                </Button>
              </>
            )}
          </section>
        )}
        <p className="text-center text-[11px] text-muted-foreground">Oxys Restaurante</p>
      </div>
    </main>
  );
}
