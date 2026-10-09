import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, LogOut, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useTrial } from '@/hooks/useTrial';
import { OXYS_WHATSAPP_LABEL, trialWhatsappLink } from '@/lib/trial';

/** Fim do teste grátis: a loja para e o login mostra só o contato para contratar um plano. */
export default function TrialGate({ children }: { children: ReactNode }) {
  const { trial } = useTrial();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  // vira na hora em que o prazo acaba, sem precisar recarregar
  useEffect(() => {
    if (!trial || trial.expired) return;
    const ms = new Date(trial.trial_ends_at).getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, ms) + 500);
    return () => clearTimeout(t);
  }, [trial]);

  const expired = !!trial && (trial.expired || new Date(trial.trial_ends_at).getTime() <= now);
  if (!expired) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <Clock3 className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Seu teste grátis terminou</h1>
            <p className="text-sm text-muted-foreground">
              O período de teste de <b>{trial!.name}</b> acabou em{' '}
              {new Date(trial!.trial_ends_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} e o acesso foi bloqueado.
              Seus dados continuam guardados: fale com a Oxys para escolher um plano e voltar a usar na hora.
            </p>
          </div>
          <Button asChild className="h-11 w-full gap-2 bg-[#25d366] text-base font-semibold text-white hover:bg-[#1ebe5b]">
            <a href={trialWhatsappLink(trial!.name, true)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-5 w-5" /> Falar no WhatsApp {OXYS_WHATSAPP_LABEL}
            </a>
          </Button>
          <Button variant="ghost" className="w-full gap-2" onClick={async () => { await signOut(); navigate('/login'); }}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
