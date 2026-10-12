import { useEffect, useState } from 'react';
import { Clock3, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePlansList, useTrial, useTrialSuggestion } from '@/hooks/useTrial';
import { remaining, trialWhatsappLink } from '@/lib/trial';
import TrialSuggestion from '@/components/TrialSuggestion';

const pad = (n: number) => String(n).padStart(2, '0');

/** Contagem regressiva do teste grátis (canto do topo do admin): ao clicar, mostra o plano ideal e o contato. */
export default function TrialClock() {
  const { trial } = useTrial();
  const { data: suggestion } = useTrialSuggestion(trial?.restaurant_id);
  const { data: plans } = usePlansList(!!trial);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!trial) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [trial]);
  if (!trial) return null;

  const r = remaining(trial.trial_ends_at, now);
  const urgent = r.days < 3;
  const link = trialWhatsappLink(trial.name, false, suggestion?.plan?.name);
  return (
    <div data-tour="trial-clock" className={cn(
      'flex items-center gap-2 rounded-full border px-3 py-1 text-xs sm:text-sm',
      urgent ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-primary/40 bg-primary/10 text-foreground',
    )}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-2" aria-label="Detalhes do teste grátis">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Teste grátis:</span>
            <span className="font-semibold tabular-nums" aria-label="Tempo restante do teste">
              {r.days}d {pad(r.hours)}:{pad(r.minutes)}:{pad(r.seconds)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div>
            <p className="font-semibold">Seu teste grátis</p>
            <p className="text-xs text-muted-foreground">
              Todas as funções liberadas até {new Date(trial.trial_ends_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
              As etiquetas no menu mostram de qual plano é cada tela{plans && plans.length > 1 ? ` (${plans.slice(1).map(p => `${p.name.slice(0, 3).toUpperCase()} = ${p.name}`).join(', ')}; sem etiqueta = ${plans[0].name})` : ''}.
            </p>
          </div>
          <TrialSuggestion suggestion={suggestion} />
          <Button asChild size="sm" className="w-full gap-2">
            <a href={link} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Contratar pelo WhatsApp</a>
          </Button>
        </PopoverContent>
      </Popover>
      <Button asChild size="sm" className="ml-1 h-7 gap-1 rounded-full px-3 text-xs">
        <a href={link} target="_blank" rel="noreferrer">
          <MessageCircle className="h-3.5 w-3.5" /> <span className="hidden md:inline">Contratar plano</span><span className="md:hidden">Plano</span>
        </a>
      </Button>
    </div>
  );
}
