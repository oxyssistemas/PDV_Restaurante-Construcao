import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';
import { storeClient } from '@/integrations/supabase/storeClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronRight, Eye, EyeOff, Loader2, LogOut, ReceiptText, UserRound } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { brl, callStore, type CustomerAccount } from '@/lib/deliveryStore';

export const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Sessão do cliente na loja (separada da equipe). */
export function useStoreSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    storeClient.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: { subscription } } = storeClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  return { session, ready };
}

const field = 'h-11 rounded-xl border-white/10 bg-white/[0.03]';

/** Entrar ou criar conta para pedir. A conta vale para todas as lojas Oxys; os dados vão para o CRM da loja. */
export function StoreAuthDialog({ open, onOpenChange, slug, storeName, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; slug: string; storeName: string; onDone?: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'signup') await callStore({ action: 'signup', slug, name, phone, email, password });
      const { error } = await storeClient.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Email ou senha incorretos.' : error.message);
    },
    onSuccess: () => {
      setPassword('');
      onOpenChange(false);
      toast({ title: mode === 'signup' ? 'Conta criada!' : 'Bem-vindo de volta!' });
      onDone?.();
    },
    onError: (e: Error) => {
      if (/já tem conta/.test(e.message)) setMode('login');
      toast({ title: 'Não foi possível entrar', description: e.message, variant: 'destructive' });
    },
  });

  const can = /\S+@\S+\.\S+/.test(email) && password.length >= 6
    && (mode === 'login' || (name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-white/[0.06] bg-[#0b0b0b] p-0">
        <div className="relative px-6 pb-4 pt-7">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-primary/25 blur-[70px]" />
          <DialogHeader className="relative text-left">
            <DialogTitle className="text-2xl font-extrabold">{mode === 'login' ? 'Entrar' : 'Criar conta'}</DialogTitle>
            <DialogDescription>
              {mode === 'login' ? `Entre para pedir em ${storeName}.` : `Leva menos de 1 minuto. Seus dados ficam salvos para os próximos pedidos.`}
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.04] p-1">
            {(['login', 'signup'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn('rounded-xl py-2 text-sm font-semibold transition-colors', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {m === 'login' ? 'Já tenho conta' : 'Sou novo aqui'}
              </button>
            ))}
          </div>
        </div>

        <form className="space-y-3 px-6 pb-6" onSubmit={e => { e.preventDefault(); if (can) submit.mutate(); }}>
          {mode === 'signup' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sa-name">Nome</Label>
                <Input id="sa-name" value={name} maxLength={80} autoComplete="name" className={field} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sa-phone">WhatsApp</Label>
                <Input id="sa-phone" value={phone} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" className={field} onChange={e => setPhone(formatPhone(e.target.value))} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sa-email">Email</Label>
            <Input id="sa-email" type="email" value={email} autoComplete="email" className={field} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-pass">Senha</Label>
            <div className="relative">
              <Input id="sa-pass" type={show ? 'text' : 'password'} value={password} minLength={6} maxLength={72}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={cn(field, 'pr-11')}
                placeholder={mode === 'signup' ? 'Mínimo de 6 caracteres' : undefined} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" size="lg" className="mt-2 h-12 w-full rounded-2xl text-base font-bold" disabled={!can || submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}
          </Button>
          {mode === 'login' && (
            <p className="text-center text-xs text-muted-foreground">Esqueceu a senha? Fale com a loja pelo WhatsApp.</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS: Record<string, [string, string]> = {
  pending: ['Recebido', 'bg-white/10 text-foreground'],
  preparing: ['Em preparo', 'bg-amber-500/15 text-amber-400'],
  out_for_delivery: ['Saiu para entrega', 'bg-sky-500/15 text-sky-400'],
  delivered: ['Entregue', 'bg-emerald-500/15 text-emerald-400'],
  cancelled: ['Cancelado', 'bg-red-500/15 text-red-400'],
};

/** Minha conta: pedidos nesta loja, dados e sair. */
export function StoreAccountSheet({ open, onOpenChange, side, slug, account, loading, tab, onTab, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; side: 'bottom' | 'right'; slug: string;
  account: CustomerAccount | undefined; loading: boolean; tab: 'orders' | 'profile'; onTab: (t: 'orders' | 'profile') => void; onSaved: () => void;
}) {
  const p = account?.profile;
  const [form, setForm] = useState({ name: '', phone: '', address: '', complement: '' });
  useEffect(() => {
    if (p) setForm({ name: p.name, phone: formatPhone(p.phone), address: p.address ?? '', complement: p.complement ?? '' });
  }, [p]);

  const save = useMutation({
    mutationFn: () => callStore({ action: 'me', slug, profile: form }),
    onSuccess: () => { toast({ title: 'Dados salvos' }); onSaved(); },
    onError: (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn('flex flex-col gap-0 border-white/[0.06] bg-[#0b0b0b] p-0', side === 'bottom' ? 'max-h-[92dvh] rounded-t-3xl' : 'w-full sm:max-w-md')}>
        {side === 'bottom' && <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-white/15" />}
        <SheetHeader className="px-5 pb-3 pt-4 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary"><UserRound className="h-5 w-5" /></span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl font-extrabold">{p?.name ? `Olá, ${p.name.split(' ')[0]}!` : 'Minha conta'}</SheetTitle>
              <p className="truncate text-xs text-muted-foreground">{account?.email}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.04] p-1">
            {([['orders', 'Meus pedidos'], ['profile', 'Meus dados']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => onTab(k)}
                className={cn('rounded-xl py-2 text-sm font-semibold transition-colors', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-primary" /> : tab === 'orders' ? (
            !account?.orders.length ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-muted-foreground">
                <ReceiptText className="h-8 w-8" /> Você ainda não fez pedidos nesta loja.
              </div>
            ) : (
              <ul className="space-y-2">
                {account.orders.map(o => {
                  const pickup = o.order_type === 'takeaway';
                  const [label, tone] = STATUS[o.delivery_status] ?? [o.delivery_status, 'bg-white/10'];
                  const text = pickup && o.delivery_status === 'out_for_delivery' ? 'Pronto p/ retirada' : pickup && o.delivery_status === 'delivered' ? 'Retirado' : label;
                  const items = o.order_items.filter(i => i.status !== 'cancelled');
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">#{o.code}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone)}>{text}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{items.map(i => `${i.quantity}x ${i.menu_items?.name ?? ''}`).join(', ')}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · <b className="text-foreground">{brl(Number(o.total) + Number(o.delivery_fee || 0))}</b>
                        </p>
                      </div>
                      {o.public_token && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </>
                  );
                  return (
                    <li key={o.id}>
                      {o.public_token ? (
                        <Link to={`/pedir/${slug}/pedido/${o.id}?t=${o.public_token}`} onClick={() => onOpenChange(false)}
                          className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-card p-3 transition-colors hover:border-white/20">{inner}</Link>
                      ) : <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-card p-3">{inner}</div>}
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
              <div className="space-y-1.5"><Label htmlFor="ac-name">Nome</Label><Input id="ac-name" value={form.name} maxLength={80} className={field} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ac-phone">WhatsApp</Label><Input id="ac-phone" value={form.phone} inputMode="tel" className={field} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ac-addr">Endereço (rua e número)</Label><Input id="ac-addr" value={form.address} maxLength={200} className={field} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ac-comp">Complemento / referência</Label><Input id="ac-comp" value={form.complement} maxLength={90} className={field} onChange={e => setForm({ ...form, complement: e.target.value })} /></div>
              <Button type="submit" className="h-11 w-full rounded-2xl font-bold" disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar dados
              </Button>
            </form>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          <Button variant="ghost" className="w-full gap-2 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={async () => { await storeClient.auth.signOut(); onOpenChange(false); }}>
            <LogOut className="h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
