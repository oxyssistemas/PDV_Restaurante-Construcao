import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { BellRing, Loader2, Users } from 'lucide-react';
import { callBooking } from './Booking';

type Status = { name: string; party: number; status: string; position: number | null; restaurant: string; called_at: string | null };

/** Página pública da fila: posição atualizada sozinha e aviso quando a mesa fica pronta. */
export default function QueueStatus() {
  const { token = '' } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['queue-status', token], retry: false, refetchInterval: 15_000,
    queryFn: () => callBooking<Status>({ action: 'queue_status', token }),
  });
  const leave = useMutation({ mutationFn: () => callBooking({ action: 'queue_leave', token }), onSuccess: () => refetch() });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !data) return <main className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Fila não encontrada.</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <p className="text-sm text-muted-foreground">{data.restaurant}</p>
      {data.status === 'waiting' && (
        <>
          <p className="text-lg">Olá, {data.name}! Sua posição na fila:</p>
          <p className="text-7xl font-extrabold text-primary" aria-live="polite">{data.position}º</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" /> {data.party} pessoa(s) · atualiza sozinho</p>
        </>
      )}
      {data.status === 'called' && (
        <div className="space-y-2 rounded-2xl border-2 border-primary bg-primary/10 p-6" role="alert">
          <BellRing className="mx-auto h-10 w-10 text-primary" />
          <p className="text-2xl font-bold">Sua mesa está pronta!</p>
          <p className="text-sm">Pode vir até a recepção, {data.name}.</p>
        </div>
      )}
      {data.status === 'seated' && <p className="text-xl font-semibold">Bom apetite, {data.name}! 😊</p>}
      {(data.status === 'cancelled' || data.status === 'no_show') && <p className="text-lg text-muted-foreground">Você saiu da fila.</p>}
      {['waiting', 'called'].includes(data.status) && (
        <Button variant="ghost" className="text-destructive" disabled={leave.isPending} onClick={() => leave.mutate()}>Sair da fila</Button>
      )}
    </main>
  );
}
