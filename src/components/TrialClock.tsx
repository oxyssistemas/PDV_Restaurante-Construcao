import { useEffect, useState } from 'react';
import { Clock3, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTrial } from '@/hooks/useTrial';
import { remaining, trialWhatsappLink } from '@/lib/trial';

const pad = (n: number) => String(n).padStart(2, '0');

/** Contagem regressiva do teste grátis (canto do topo do admin) com o botão para contratar um plano. */
export default function TrialClock() {
  const { trial } = useTrial();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!trial) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [trial]);
  if (!trial) return null;

  const r = remaining(trial.trial_ends_at, now);
  const urgent = r.days < 3;
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-full border px-3 py-1 text-xs sm:text-sm',
      urgent ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-primary/40 bg-primary/10 text-foreground',
    )}>
      <Clock3 className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">Teste grátis:</span>
      <span className="font-semibold tabular-nums" aria-label="Tempo restante do teste">
        {r.days}d {pad(r.hours)}:{pad(r.minutes)}:{pad(r.seconds)}
      </span>
      <Button asChild size="sm" className="ml-1 h-7 gap-1 rounded-full px-3 text-xs">
        <a href={trialWhatsappLink(trial.name)} target="_blank" rel="noreferrer">
          <MessageCircle className="h-3.5 w-3.5" /> <span className="hidden md:inline">Contratar plano</span><span className="md:hidden">Plano</span>
        </a>
      </Button>
    </div>
  );
}
