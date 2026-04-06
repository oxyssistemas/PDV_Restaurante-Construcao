import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UtensilsCrossed, Loader2, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function Setup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('bootstrap-admin', {
      body: { email, password },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else if (data?.error) {
      toast({ title: 'Erro', description: data.error, variant: 'destructive' });
    } else {
      setDone(true);
      toast({ title: 'Super Admin criado com sucesso!' });
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl border-0 text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-accent mx-auto" />
            <h2 className="text-xl font-bold">Super Admin criado!</h2>
            <p className="text-muted-foreground">
              Agora você pode fazer login com suas credenciais.
            </p>
            <Button onClick={() => window.location.href = '/login'} className="mt-4">
              Ir para Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-8 w-8" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Configuração Inicial</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Crie sua conta de Super Admin (distribuidor)
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
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Super Admin
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
