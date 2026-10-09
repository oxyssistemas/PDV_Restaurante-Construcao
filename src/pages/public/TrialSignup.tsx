import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock3, Loader2, LogIn, MessageCircle } from 'lucide-react';
import { edgeErrorMessage } from '@/lib/functionError';
import { OXYS_WHATSAPP_LABEL, TRIAL_DAYS, trialWhatsappLink } from '@/lib/trial';
import oxysLogo from '@/assets/oxys-logo.png';
import { isValidDocument, maskDocument } from '@/lib/document';

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

/** Cadastro do teste grátis (página pública): cria a loja e o login do dono com tudo liberado por 14 dias. */
export default function TrialSignup() {
  const [form, setForm] = useState({ name: '', restaurant: '', document: '', phone: '', email: '', password: '', confirm: '', website: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; endsAt: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k === 'phone' ? maskPhone(e.target.value) : k === 'document' ? maskDocument(e.target.value) : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidDocument(form.document)) return setError('Informe um CPF ou CNPJ válido.');
    if (form.password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (form.password !== form.confirm) return setError('As senhas não conferem.');
    setBusy(true);
    const { confirm: _c, ...body } = form;
    const { data, error: fnError } = await supabase.functions.invoke<{ ok?: boolean; trialEndsAt?: string; error?: string }>('trial-signup', { body });
    setBusy(false);
    if (fnError || data?.error) return setError(data?.error ?? await edgeErrorMessage(fnError));
    setDone({ email: form.email.trim().toLowerCase(), endsAt: data?.trialEndsAt ?? new Date().toISOString() });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="space-y-3 pb-2 text-center">
          <img src={oxysLogo} alt="Oxys Restaurante" className="mx-auto h-20 w-auto object-contain" />
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {done ? 'Conta criada!' : `Teste grátis por ${TRIAL_DAYS} dias`}
            </CardTitle>
            <CardDescription className="mt-1">
              {done
                ? 'Sua loja já está pronta com todas as funções liberadas.'
                : 'Todas as funções da plataforma liberadas. Sem cartão de crédito.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                <span>
                  Entre com <b>{done.email}</b> e a senha que você criou. Seu teste vai até{' '}
                  <b>{new Date(done.endsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b>.
                </span>
              </div>
              <Button asChild className="h-11 w-full gap-2 text-base font-semibold">
                <Link to="/login"><LogIn className="h-4 w-4" /> Ir para o login</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Para continuar depois do teste, fale com a Oxys no WhatsApp {OXYS_WHATSAPP_LABEL}.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trial-name">Seu nome</Label>
                <Input id="trial-name" autoComplete="name" value={form.name} onChange={set('name')} required maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-restaurant">Nome do restaurante</Label>
                <Input id="trial-restaurant" value={form.restaurant} onChange={set('restaurant')} required maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-document">CPF ou CNPJ</Label>
                <Input id="trial-document" inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00" value={form.document} onChange={set('document')} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-phone">WhatsApp</Label>
                <Input id="trial-phone" inputMode="tel" autoComplete="tel" placeholder="(43) 99999-9999" value={form.phone} onChange={set('phone')} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-email">Email (será o seu login)</Label>
                <Input id="trial-email" type="email" autoComplete="email" placeholder="seu@email.com" value={form.email} onChange={set('email')} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trial-password">Senha</Label>
                  <Input id="trial-password" type="password" autoComplete="new-password" placeholder="mín. 8 caracteres" value={form.password} onChange={set('password')} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial-confirm">Repita a senha</Label>
                  <Input id="trial-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
                </div>
              </div>
              {/* campo escondido contra robôs */}
              <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Começar meu teste grátis
              </Button>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Depois de {TRIAL_DAYS} dias o acesso é bloqueado. Para continuar, fale com a gente e escolha um plano.
                  Ao criar a conta você aceita os <Link to="/termos" className="underline">Termos de Uso</Link> e a{' '}
                  <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
                </span>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {!done && <span>Já tem conta? <Link to="/login" className="font-medium text-primary hover:underline">Entrar</Link></span>}
        <a href={trialWhatsappLink()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          <MessageCircle className="h-4 w-4" /> Dúvidas? {OXYS_WHATSAPP_LABEL}
        </a>
      </div>
    </div>
  );
}
