import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bike, Clock, ImageIcon, Loader2, MapPin, Minus, Plus, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { brl, callStore, PAYMENT_LABELS, type StoreData } from '@/lib/deliveryStore';

type CartLine = { qty: number; notes: string };
type Saved = { name: string; phone: string; address: string; complement: string; zone: string };

const SAVED_KEY = 'oxys.delivery.customer';
const loadSaved = (): Partial<Saved> => {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}'); } catch { return {}; }
};
const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function OnlineStore() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const channel = params.get('canal') === 'whatsapp' ? 'whatsapp' : 'site';
  const saved = useMemo(loadSaved, []);

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [name, setName] = useState(saved.name ?? '');
  const [phone, setPhone] = useState(formatPhone(params.get('tel') ?? saved.phone ?? ''));
  const [address, setAddress] = useState(saved.address ?? '');
  const [complement, setComplement] = useState(saved.complement ?? '');
  const [zone, setZone] = useState(saved.zone ?? '');
  const [payment, setPayment] = useState('');
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const sections = useRef<Record<string, HTMLElement | null>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['online-store', slug],
    retry: false,
    refetchInterval: 60_000, // aberto/fechado e preços atualizados
    queryFn: () => callStore<StoreData>({ action: 'store', slug }),
  });
  const store = data?.store;

  useEffect(() => {
    if (!store) return;
    document.title = `${store.name} · Pedir online`;
    if (!store.delivery_enabled && store.pickup_enabled) setMode('pickup');
    if (store.zones.length && zone && !store.zones.some(z => z.name === zone)) setZone('');
  }, [store, zone]);

  const items = data?.items ?? [];
  const lines = Object.entries(cart).map(([id, l]) => ({ item: items.find(i => i.id === id), ...l })).filter(l => l.item);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.item!.price * l.qty, 0);
  const fee = mode === 'pickup' || !store ? 0 : store.zones.length ? (store.zones.find(z => z.name === zone)?.fee ?? 0) : store.default_fee;
  const total = subtotal + fee;
  const belowMin = !!store && subtotal < store.min_order;

  const setQty = (id: string, delta: number) => setCart(prev => {
    const qty = Math.min(50, Math.max(0, (prev[id]?.qty ?? 0) + delta));
    const next = { ...prev };
    if (qty === 0) delete next[id]; else next[id] = { qty, notes: prev[id]?.notes ?? '' };
    return next;
  });

  const submit = useMutation({
    mutationFn: () => callStore<{ orderId: string; token: string }>({
      action: 'order', slug,
      order: {
        name, phone, mode, channel, payment, notes,
        change_for: payment === 'cash' ? changeFor.replace(',', '.') : '',
        address: mode === 'delivery' ? [address.trim(), complement.trim()].filter(Boolean).join(' · ') : '',
        zone: mode === 'delivery' ? zone : '',
        items: lines.map(l => ({ menu_item_id: l.item!.id, quantity: l.qty, notes: l.notes || null })),
      },
    }),
    onSuccess: ({ orderId, token }) => {
      try { localStorage.setItem(SAVED_KEY, JSON.stringify({ name, phone, address, complement, zone })); } catch { /* sem armazenamento */ }
      navigate(`/pedir/${slug}/pedido/${orderId}?t=${token}`);
    },
    onError: (e: Error) => toast({ title: 'Não foi possível enviar', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !store) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Loja indisponível</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{(error as Error)?.message || 'Confira o link com o restaurante.'}</p>
      </main>
    );
  }

  const grouped = [
    ...(data!.categories.map(c => ({ ...c, items: items.filter(i => i.category_id === c.id) }))),
    { id: 'outros', name: 'Outros', items: items.filter(i => !i.category_id || !data!.categories.some(c => c.id === i.category_id)) },
  ].filter(c => c.items.length > 0);

  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canSubmit = store.is_open && count > 0 && !belowMin && name.trim().length >= 2 && phoneOk && !!payment
    && (mode === 'pickup' || (address.trim().length >= 5 && (!store.zones.length || !!zone)));

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {store.logo ? (
            <img src={store.logo} alt={store.name} className="h-11 w-11 rounded-xl object-contain" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><UtensilsCrossed className="h-5 w-5" /></div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{store.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className={cn('font-semibold', store.is_open ? 'text-[hsl(var(--success))]' : 'text-destructive')}>
                {store.is_open ? '● Aberto' : '● Fechado'}
              </span>
              {store.delivery_enabled && <span className="flex items-center gap-1"><Bike className="h-3 w-3" /> {store.eta_minutes} min</span>}
              {store.min_order > 0 && <span>Mínimo {brl(store.min_order)}</span>}
            </div>
          </div>
        </div>
        {grouped.length > 1 && (
          <nav className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pb-3" aria-label="Categorias">
            {grouped.map(c => (
              <button key={c.id} type="button" onClick={() => sections.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary hover:text-primary">
                {c.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        {(store.notice || !store.is_open) && (
          <div className={cn('rounded-2xl border p-4 text-sm', store.is_open ? 'border-primary/30 bg-primary/5' : 'border-destructive/40 bg-destructive/10')}>
            {!store.is_open && <p className="font-semibold">Estamos fechados no momento.</p>}
            {store.notice && <p>{store.notice}</p>}
            {store.hours_text && <p className="mt-1 flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {store.hours_text}</p>}
          </div>
        )}

        {grouped.map(cat => (
          <section key={cat.id} ref={el => { sections.current[cat.id] = el; }} className="scroll-mt-32">
            <h2 className="mb-3 text-lg font-bold tracking-tight">{cat.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {cat.items.map(item => (
                <article key={item.id} className="pdv-card flex gap-3 p-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="font-semibold leading-tight">{item.name}</h3>
                    {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-bold text-primary">{brl(item.price)}</span>
                      {cart[item.id] ? (
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Menos" onClick={() => setQty(item.id, -1)}><Minus className="h-4 w-4" /></Button>
                          <span className="w-5 text-center text-sm font-semibold">{cart[item.id].qty}</span>
                          <Button size="icon" className="h-8 w-8" aria-label="Mais" onClick={() => setQty(item.id, 1)}><Plus className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" className="gap-1" disabled={!store.is_open} onClick={() => setQty(item.id, 1)}><Plus className="h-4 w-4" /> Adicionar</Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        {(store.address || store.hours_text) && (
          <footer className="space-y-1 border-t border-border pt-6 text-xs text-muted-foreground">
            {store.address && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {store.address}</p>}
            {store.hours_text && <p className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {store.hours_text}</p>}
          </footer>
        )}
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur">
          <Button size="lg" className="mx-auto flex w-full max-w-3xl justify-between gap-2" onClick={() => setOpen(true)}>
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Ver sacola ({count})</span>
            <span>{brl(subtotal)}</span>
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[92vh] max-w-3xl overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle>Sua sacola</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-5">
            <ul className="space-y-3">
              {lines.map(l => (
                <li key={l.item!.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{l.item!.name}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Menos" onClick={() => setQty(l.item!.id, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                    <span className="w-5 text-center">{l.qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Mais" onClick={() => setQty(l.item!.id, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                    <span className="w-20 text-right">{brl(l.item!.price * l.qty)}</span>
                  </div>
                  <Input value={l.notes} maxLength={300} placeholder="Observação (ex.: sem cebola)" className="h-8 text-xs"
                    onChange={e => setCart(prev => ({ ...prev, [l.item!.id]: { ...prev[l.item!.id], notes: e.target.value } }))} />
                </li>
              ))}
            </ul>

            {store.delivery_enabled && store.pickup_enabled && (
              <div className="grid grid-cols-2 gap-2">
                {([['delivery', 'Entrega', Bike], ['pickup', 'Retirar no local', Store]] as const).map(([k, l, Icon]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={cn('flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium', mode === k ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                    <Icon className="h-4 w-4" /> {l}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="os-name">Seu nome *</Label>
                <Input id="os-name" value={name} maxLength={80} autoComplete="name" onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="os-phone">WhatsApp *</Label>
                <Input id="os-phone" value={phone} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" onChange={e => setPhone(formatPhone(e.target.value))} />
              </div>
            </div>

            {mode === 'delivery' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="os-address">Endereço (rua e número) *</Label>
                  <Input id="os-address" value={address} maxLength={200} autoComplete="street-address" onChange={e => setAddress(e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="os-comp">Complemento / referência</Label>
                    <Input id="os-comp" value={complement} maxLength={90} onChange={e => setComplement(e.target.value)} />
                  </div>
                  {store.zones.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Bairro *</Label>
                      <Select value={zone} onValueChange={setZone}>
                        <SelectTrigger><SelectValue placeholder="Escolha o bairro" /></SelectTrigger>
                        <SelectContent>
                          {store.zones.map(z => <SelectItem key={z.name} value={z.name}>{z.name} · {z.fee > 0 ? brl(z.fee) : 'grátis'}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm">
                Retire em <strong>{store.address || 'nosso endereço'}</strong> · pronto em cerca de {store.pickup_eta_minutes} min.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Pagamento na {mode === 'pickup' ? 'retirada' : 'entrega'} *</Label>
              <div className="grid grid-cols-2 gap-2">
                {store.payment_methods.map(m => (
                  <button key={m} type="button" onClick={() => setPayment(m)}
                    className={cn('rounded-xl border p-2.5 text-sm', payment === m ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                    {PAYMENT_LABELS[m] ?? m}
                  </button>
                ))}
              </div>
              {payment === 'cash' && (
                <Input value={changeFor} inputMode="decimal" placeholder="Troco para quanto? (opcional)" onChange={e => setChangeFor(e.target.value.replace(/[^\d,.]/g, ''))} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="os-notes">Observações do pedido</Label>
              <Textarea id="os-notes" value={notes} maxLength={500} rows={2} onChange={e => setNotes(e.target.value)} />
            </div>

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              {mode === 'delivery' && <div className="flex justify-between"><span>Entrega</span><span>{store.zones.length && !zone ? 'escolha o bairro' : fee > 0 ? brl(fee) : 'grátis'}</span></div>}
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{brl(total)}</span></div>
              {belowMin && <Badge variant="destructive" className="mt-1">Pedido mínimo: {brl(store.min_order)}</Badge>}
            </div>

            <Button size="lg" className="w-full gap-2" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {store.is_open ? `Fazer pedido · ${brl(total)}` : 'Loja fechada'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
