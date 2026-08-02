import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import oxysLogo from '@/assets/oxys-logo.png.asset.json';

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 300;
const LOCAL_KEY = 'oxys_login_guard';

type Guard = { attempts: number; lockedUntil: number | null };

function readGuard(): Guard {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw) as Guard;
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function writeGuard(g: Guard) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(g));
}

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);

  useEffect(() => {
    const g = readGuard();
    setAttemptsLeft(Math.max(0, MAX_ATTEMPTS - g.attempts));
    if (g.lockedUntil && g.lockedUntil > Date.now()) {
      setRemaining(Math.ceil((g.lockedUntil - Date.now()) / 1000));
    }
  }, []);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const lockFor = (seconds: number) => {
    setRemaining(seconds);
    writeGuard({ attempts: MAX_ATTEMPTS, lockedUntil: Date.now() + seconds * 1000 });
    setAttemptsLeft(0);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remaining > 0 || submitting) return;
    setSubmitting(true);

    // Server-side lockout check
    const { data: serverLock } = await supabase.rpc('login_lock_seconds', { _email: email });
    if (typeof serverLock === 'number' && serverLock > 0) {
      lockFor(serverLock);
      toast({
        title: 'Muitas tentativas',
        description: `Login bloqueado. Tente novamente em ${formatTime(serverLock)}.`,
        variant: 'destructive',
      });
      setSubmitting(false);
      return;
    }

    const { error } = await signIn(email, password);

    if (error) {
      const { data: lockSeconds } = await supabase.rpc('register_login_failure', { _email: email });
      const g = readGuard();
      const attempts = (g.lockedUntil && g.lockedUntil <= Date.now() ? 0 : g.attempts) + 1;

      if ((typeof lockSeconds === 'number' && lockSeconds > 0) || attempts >= MAX_ATTEMPTS) {
        const secs = typeof lockSeconds === 'number' && lockSeconds > 0 ? lockSeconds : LOCK_SECONDS;
        lockFor(secs);
        toast({
          title: 'Muitas tentativas',
          description: `Login bloqueado por ${formatTime(secs)} por segurança.`,
          variant: 'destructive',
        });
      } else {
        writeGuard({ attempts, lockedUntil: null });
        setAttemptsLeft(MAX_ATTEMPTS - attempts);
        toast({
          title: 'Erro no login',
          description: `${error.message} — ${MAX_ATTEMPTS - attempts} tentativa(s) restante(s).`,
          variant: 'destructive',
        });
      }
    } else {
      await supabase.rpc('clear_login_attempts', { _email: email });
      localStorage.removeItem(LOCAL_KEY);
      setAttemptsLeft(MAX_ATTEMPTS);
    }
    setSubmitting(false);
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-4 pb-2">
          <img
            src={oxysLogo.url}
            alt="Oxys Restaurante"
            className="mx-auto h-28 w-auto object-contain"
          />
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Oxys Restaurante</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Sistema de gestão para restaurantes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
