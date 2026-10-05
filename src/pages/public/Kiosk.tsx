import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronLeft, Loader2, Maximize, Minus, Plus, ShoppingBag, Trash2, Utensils, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type KioskItem = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null };
type KioskData = {
  restaurant: { name: string; logo: string | null };
  kiosk: { name: string; eat_in: boolean; takeaway: boolean; ask_phone: boolean; welcome: string | null; idle_seconds: number };
  featured: string[];
  categories: { id: string; name: string }[];
  items: KioskItem[];
};
type Step = 'welcome' | 'menu' | 'checkout' | 'done';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function callKiosk<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('kiosk', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || 'Sem conexão. Chame um atendente.');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Autoatendimento: o cliente monta o pedido sozinho, paga no caixa e acompanha pela senha. */
export default function Kiosk() {
  const { token = '' } = useParams();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<'eat_in' | 'takeaway'>('takeaway');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<string>('all');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [detail, setDetail] = useState<KioskItem | null>(null);
  const [done, setDone] = useState<{ ticket: number; total: number } | null>(null);

  useEffect(() => {
    document.body.classList.add('store-theme');
    return () => document.body.classList.remove('store-theme');
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kiosk', token],
    retry: 2,
    refetchInterval: 10 * 60_000, // preços e disponibilidade sempre atualizados
    queryFn: () => callKiosk<KioskData>({ action: 'menu', token }),
  });

  const reset = useCallback(() => {
    setStep('welcome'); setCart({}); setCategory('all'); setName(''); setPhone(''); setDetail(null); setDone(null);
  }, []);

  // sem toque por um tempo: volta ao início (o próximo cliente não vê o pedido do anterior)
  const idleTimer = useRef<number>();
  useEffect(() => {
    const ms = (step === 'done' ? 15 : data?.kiosk.idle_seconds ?? 90) * 1000;
    const arm = () => {
      window.clearTimeout(idleTimer.current);
      if (step !== 'welcome') idleTimer.current = window.setTimeout(reset, ms);
    };
    arm();
    const events = ['pointerdown', 'keydown'];
    events.forEach(e => window.addEventListener(e, arm));
    return () => { window.clearTimeout(idleTimer.current); events.forEach(e => window.removeEventListener(e, arm)); };
  }, [step, data?.kiosk.idle_seconds, reset]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const visible = useMemo(() => {
    if (category === 'all') {
      const featured = new Set(data?.featured ?? []);
      return [...items].sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));
    }
    return items.filter(i => i.category_id === category);
  }, [items, category, data?.featured]);
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ item: items.find(i => i.id === id)!, qty })).filter(l => l.item);
  const count = cartLines.reduce((s, l) => s + l.qty, 0);
  const total = cartLines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const add = (id: string, d = 1) => setCart(c => {
    const q = Math.max(0, Math.min(20, (c[id] ?? 0) + d));
    const next = { ...c };
    if (q) next[id] = q; else delete next[id];
    return next;
  });

  const send = useMutation({
    mutationFn: () => callKiosk<{ ticket: number; total: number }>({
      action: 'order', token,
      order: { name: name.trim(), phone: phone.trim(), mode, items: cartLines.map(l => ({ menu_item_id: l.item.id, quantity: l.qty })) },
    }),
    onSuccess: (r) => { setDone(r); setStep('done'); },
  });

  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="text-2xl font-bold">Totem indisponível</h1>
        <p className="text-muted-foreground">{(error as Error)?.message}</p>
        <Button size="lg" onClick={() => refetch()}>Tentar de novo</Button>
      </main>
    );
  }

  const { restaurant, kiosk } = data;

  // ---------- início ----------
  if (step === 'welcome') {
    const start = (m: 'eat_in' | 'takeaway') => { setMode(m); setStep('menu'); };
    return (
      <main className="relative flex min-h-screen select-none flex-col items-center justify-center gap-10 bg-background p-8 text-center">
        <button onClick={fullscreen} className="absolute right-4 top-4 rounded-full p-3 text-muted-foreground/40 hover:text-muted-foreground" aria-label="Tela cheia">
          <Maximize className="h-5 w-5" />
        </button>
        {restaurant.logo ? <img src={restaurant.logo} alt="" className="h-32 w-32 rounded-3xl object-cover shadow-xl" /> : <Utensils className="h-24 w-24 text-primary" />}
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight">{restaurant.name}</h1>
          <p className="mt-3 text-2xl text-muted-foreground">{kiosk.welcome || 'Faça seu pedido aqui e pague no caixa'}</p>
        </div>
        <div className="grid w-full max-w-2xl gap-5 sm:grid-cols-2">
          {kiosk.eat_in && (
            <button onClick={() => start('eat_in')} className="flex flex-col items-center gap-4 rounded-3xl border-2 border-primary/30 bg-card p-10 text-2xl font-bold transition active:scale-95 hover:border-primary">
              <Utensils className="h-16 w-16 text-primary" /> Comer aqui
            </button>
          )}
          {kiosk.takeaway && (
            <button onClick={() => start('takeaway')} className="flex flex-col items-center gap-4 rounded-3xl border-2 border-primary/30 bg-card p-10 text-2xl font-bold transition active:scale-95 hover:border-primary">
              <ShoppingBag className="h-16 w-16 text-primary" /> Para levar
            </button>
          )}
        </div>
        <p className="text-lg text-muted-foreground">Toque para começar</p>
      </main>
    );
  }

  // ---------- senha ----------
  if (step === 'done' && done) {
    return (
      <main className="flex min-h-screen select-none flex-col items-center justify-center gap-6 bg-background p-8 text-center" onClick={reset}>
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15"><Check className="h-14 w-14 text-emerald-500" /></div>
        <h1 className="text-4xl font-bold">Pedido enviado!</h1>
        <div className="rounded-3xl border-4 border-primary px-16 py-8">
          <div className="text-xl uppercase tracking-widest text-muted-foreground">Sua senha</div>
          <div className="text-9xl font-black text-primary">{done.ticket}</div>
        </div>
        <p className="text-2xl">Pague <b>{brl(done.total)}</b> no caixa e aguarde chamarmos <b>{name.trim().split(' ')[0]}</b>.</p>
        <p className="text-muted-foreground">Toque na tela para um novo pedido</p>
      </main>
    );
  }

  // ---------- cardápio e finalização ----------
  return (
    <main className="flex h-screen select-none flex-col bg-background">
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Button variant="ghost" size="lg" className="gap-2 text-lg" onClick={step === 'checkout' ? () => setStep('menu') : reset}>
          <ChevronLeft className="h-6 w-6" /> {step === 'checkout' ? 'Voltar ao cardápio' : 'Início'}
        </Button>
        <div className="mx-auto text-center">
          <div className="text-xl font-bold">{restaurant.name}</div>
          <div className="text-sm text-muted-foreground">{mode === 'eat_in' ? 'Comer aqui' : 'Para levar'}</div>
        </div>
        <Button variant="ghost" size="lg" className="gap-2 text-lg text-destructive" onClick={reset}><X className="h-5 w-5" /> Cancelar</Button>
      </header>

      {step === 'menu' ? (
        <div className="flex min-h-0 flex-1">
          <nav className="w-56 shrink-0 space-y-2 overflow-y-auto border-r border-border p-3">
            {[{ id: 'all', name: 'Destaques' }, ...data.categories.filter(c => items.some(i => i.category_id === c.id))].map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={cn('w-full rounded-2xl px-4 py-4 text-left text-lg font-semibold transition', category === c.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {c.name}
              </button>
            ))}
          </nav>
          <section className="grid flex-1 auto-rows-max grid-cols-2 gap-4 overflow-y-auto p-4 xl:grid-cols-3">
            {visible.map(i => (
              <button key={i.id} onClick={() => setDetail(i)} className="relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-left transition active:scale-[0.98]">
                {i.image_url ? <img src={i.image_url} alt="" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center bg-muted/40"><Utensils className="h-10 w-10 text-muted-foreground/40" /></div>}
                <div className="flex flex-1 flex-col p-4">
                  <div className="text-lg font-bold leading-tight">{i.name}</div>
                  {i.description && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.description}</div>}
                  <div className="mt-auto pt-2 text-xl font-extrabold text-primary">{brl(i.price)}</div>
                </div>
                {cart[i.id] && <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{cart[i.id]}</span>}
              </button>
            ))}
          </section>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-y-auto p-6">
          <h2 className="text-3xl font-bold">Seu pedido</h2>
          <ul className="space-y-3">
            {cartLines.map(l => (
              <li key={l.item.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">{l.item.name}</div>
                  <div className="text-muted-foreground">{brl(l.item.price)}</div>
                </div>
                <Button size="icon" variant="outline" className="h-12 w-12 rounded-xl" onClick={() => add(l.item.id, -1)}>{l.qty === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}</Button>
                <span className="w-8 text-center text-xl font-bold">{l.qty}</span>
                <Button size="icon" variant="outline" className="h-12 w-12 rounded-xl" onClick={() => add(l.item.id)}><Plus className="h-5 w-5" /></Button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <label className="text-lg font-semibold">Seu nome (para chamarmos você)</label>
            <Input className="h-16 rounded-2xl text-2xl" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Ex.: Maria" />
          </div>
          {kiosk.ask_phone && (
            <div className="space-y-2">
              <label className="text-lg font-semibold">Celular <span className="font-normal text-muted-foreground">(opcional — acumula pontos/cashback)</span></label>
              <Input className="h-16 rounded-2xl text-2xl" inputMode="tel" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          )}
          {send.error && <p className="text-lg text-destructive">{(send.error as Error).message}</p>}
        </div>
      )}

      <footer className="flex items-center gap-4 border-t border-border px-6 py-4">
        <div className="text-xl">{count} item(ns) · <b className="text-2xl">{brl(total)}</b></div>
        {step === 'menu' ? (
          <Button size="lg" className="ml-auto h-16 rounded-2xl px-10 text-xl" disabled={!count} onClick={() => setStep('checkout')}>Finalizar pedido</Button>
        ) : (
          <Button size="lg" className="ml-auto h-16 rounded-2xl px-10 text-xl" disabled={!count || name.trim().length < 2 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Loader2 className="mr-2 h-6 w-6 animate-spin" />} Enviar pedido · pagar no caixa
          </Button>
        )}
      </footer>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-card sm:rounded-3xl" onClick={e => e.stopPropagation()}>
            {detail.image_url && <img src={detail.image_url} alt="" className="h-64 w-full object-cover" />}
            <div className="space-y-3 p-6">
              <h3 className="text-3xl font-bold">{detail.name}</h3>
              {detail.description && <p className="text-lg text-muted-foreground">{detail.description}</p>}
              <div className="text-3xl font-extrabold text-primary">{brl(detail.price)}</div>
              <div className="flex items-center gap-4 pt-2">
                <Button size="icon" variant="outline" className="h-14 w-14 rounded-2xl" onClick={() => add(detail.id, -1)} disabled={!cart[detail.id]}><Minus className="h-6 w-6" /></Button>
                <span className="w-10 text-center text-3xl font-bold">{cart[detail.id] ?? 0}</span>
                <Button size="icon" variant="outline" className="h-14 w-14 rounded-2xl" onClick={() => add(detail.id)}><Plus className="h-6 w-6" /></Button>
                <Button size="lg" className="ml-auto h-14 rounded-2xl px-8 text-lg" onClick={() => { if (!cart[detail.id]) add(detail.id); setDetail(null); }}>
                  {cart[detail.id] ? 'Pronto' : 'Adicionar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
