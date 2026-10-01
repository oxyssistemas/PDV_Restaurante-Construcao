import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowRight, Beef, Bike, Megaphone, CakeSlice, ChevronDown, Clock, Coffee, CupSoda, Drumstick, Fish, Flame, Home, ImageIcon,
  LayoutGrid, Loader2, MapPin, MessageCircle, Minus, Pizza, Plus, Salad, Sandwich, Search, ShoppingBag, Soup, Store,
  ReceiptText, UserRound, UtensilsCrossed, Wallet, Wine,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { brl, callStore, PAYMENT_LABELS, waLink, type CustomerAccount, type StoreData, type StoreItem } from '@/lib/deliveryStore';
import { formatPhone, StoreAccountSheet, StoreAuthDialog, useStoreSession } from '@/components/store/StoreAccount';

type CartLine = { qty: number; notes: string };
type Saved = { name: string; phone: string; address: string; complement: string; zone: string };

const SAVED_KEY = 'oxys.delivery.customer';
const loadSaved = (): Partial<Saved> => {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}'); } catch { return {}; }
};

// ---------- apresentação ----------
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Ícone da categoria pelo nome (só visual; as categorias são as do cardápio). */
const CATEGORY_ICONS: [RegExp, ComponentType<{ className?: string }>][] = [
  [/pizza/, Pizza], [/burg|lanche|sanduich|x-/, Sandwich], [/bebida|refri|suco|drink/, CupSoda],
  [/sobremesa|doce|bolo|torta|acai/, CakeSlice], [/cafe/, Coffee], [/vinho|cerveja|chopp|bar/, Wine],
  [/salada|vegan|veget/, Salad], [/frango|asa/, Drumstick], [/peixe|sushi|japones|frutos/, Fish],
  [/sopa|caldo/, Soup], [/carne|churras|grelhad|espet|porc/, Beef],
];
const categoryIcon = (name: string) => CATEGORY_ICONS.find(([re]) => re.test(norm(name)))?.[1] ?? UtensilsCrossed;

const SECTION_LIMIT = 8;

function ProductCard({ item, qty, disabled, onAdd, onRemove }: {
  item: StoreItem; qty: number; disabled: boolean; onAdd: () => void; onRemove: () => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-all duration-200 hover:-translate-y-1 hover:border-white/15 hover:shadow-[0_18px_40px_-18px_rgba(225,29,42,0.45)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-7 w-7 text-muted-foreground/60" /></div>
        )}
        {qty > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-lg">{qty} na sacola</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug sm:text-[15px]">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <span className="text-[15px] font-extrabold tracking-tight sm:text-base">{brl(item.price)}</span>
          {qty > 0 ? (
            <div className="ml-auto flex animate-in zoom-in-95 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5 duration-200">
              <button type="button" aria-label="Menos" onClick={onRemove}
                className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10"><Minus className="h-4 w-4" /></button>
              <span className="w-5 text-center text-sm font-bold">{qty}</span>
              <button type="button" aria-label="Mais" onClick={onAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"><Plus className="h-4 w-4" /></button>
            </div>
          ) : (
            <button type="button" aria-label={`Adicionar ${item.name}`} disabled={disabled} onClick={onAdd}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgba(225,29,42,0.8)] transition-transform duration-150 hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40">
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: ComponentType<{ className?: string }>; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function OnlineStore() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
  // Só apresentação: busca no cardápio já carregado, categoria em destaque e seções expandidas.
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [bump, setBump] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  // Conta do cliente: precisa entrar para pedir; dados vão para o CRM da loja.
  const qc = useQueryClient();
  const { session } = useStoreSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'orders' | 'profile'>('orders');
  const [afterLogin, setAfterLogin] = useState<null | 'bag' | 'orders' | 'profile'>(null);
  const userId = session?.user.id ?? null;
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['store-account', slug, userId],
    enabled: !!userId,
    queryFn: () => callStore<CustomerAccount>({ action: 'me', slug }),
  });
  const openAccount = (tab: 'orders' | 'profile') => {
    if (!userId) { setAfterLogin(tab); setAuthOpen(true); return; }
    setAccountTab(tab); setAccountOpen(true);
  };

  // Tema da loja (preto + vermelho) também nos painéis que abrem fora da página.
  useEffect(() => {
    document.body.classList.add('store-theme');
    return () => document.body.classList.remove('store-theme');
  }, []);

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

  // Dados da conta preenchem o pedido (sem apagar o que o cliente já digitou).
  useEffect(() => {
    const p = account?.profile;
    if (!p) return;
    setName(v => v || p.name);
    setPhone(v => v || formatPhone(p.phone));
    setAddress(v => v || p.address || '');
    setComplement(v => v || p.complement || '');
  }, [account]);

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
  const add = (id: string) => { setQty(id, 1); setBump(b => b + 1); };

  const submit = useMutation({
    mutationFn: () => callStore<{ orderId: string; token: string }>({
      action: 'order', slug,
      order: {
        name, phone, mode, channel, payment, notes,
        change_for: payment === 'cash' ? changeFor.replace(',', '.') : '',
        address: mode === 'delivery' ? [address.trim(), complement.trim()].filter(Boolean).join(' · ') : '',
        address_line: address.trim(), complement: complement.trim(),
        zone: mode === 'delivery' ? zone : '',
        items: lines.map(l => ({ menu_item_id: l.item!.id, quantity: l.qty, notes: l.notes || null })),
      },
    }),
    onSuccess: ({ orderId, token }) => {
      try { localStorage.setItem(SAVED_KEY, JSON.stringify({ name, phone, address, complement, zone })); } catch { /* sem armazenamento */ }
      qc.invalidateQueries({ queryKey: ['store-account', slug] });
      navigate(`/pedir/${slug}/pedido/${orderId}?t=${token}`);
    },
    onError: (e: Error) => toast({ title: 'Não foi possível enviar', description: e.message, variant: 'destructive' }),
  });

  const grouped = useMemo(() => {
    if (!data) return [];
    return [
      ...data.categories.map(c => ({ ...c, items: data.items.filter(i => i.category_id === c.id) })),
      { id: 'outros', name: 'Outros', items: data.items.filter(i => !i.category_id || !data.categories.some(c => c.id === i.category_id)) },
    ].filter(c => c.items.length > 0);
  }, [data]);

  const q = norm(query.trim());
  const results = q ? items.filter(i => norm(`${i.name} ${i.description ?? ''}`).includes(q)) : [];
  const byId = useMemo(() => new Map((data?.items ?? []).map(i => [i.id, i])), [data]);
  const withPhoto = items.filter(i => i.image_url);
  // Banner: foto escolhida pela loja; sem ela, a foto de um prato do cardápio.
  const heroImage = data?.store.hero.image ?? withPhoto[0]?.image_url ?? null;
  const heroAlt = data?.store.hero.image ? (data?.store.name ?? '') : (withPhoto[0]?.name ?? '');
  const highlights = (data?.store.featured_item_ids ?? []).map(id => byId.get(id)).filter((i): i is StoreItem => !!i);
  const promotions = data?.promotions ?? [];
  const promoRef = useRef<HTMLElement>(null);

  const goTo = (el: HTMLElement | null | undefined) => el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const pickCategory = (id: string) => {
    setActiveCat(id);
    setQuery('');
    goTo(id === 'all' ? menuRef.current : sections.current[id]);
  };
  const focusSearch = () => { searchRef.current?.focus({ preventScroll: true }); goTo(searchRef.current?.closest('section') as HTMLElement); };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !store) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]"><UtensilsCrossed className="h-8 w-8 text-muted-foreground" /></span>
        <h1 className="text-xl font-bold">Loja indisponível</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{(error as Error)?.message || 'Confira o link com o restaurante.'}</p>
      </main>
    );
  }

  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canSubmit = store.is_open && count > 0 && !belowMin && name.trim().length >= 2 && phoneOk && !!payment
    && (mode === 'pickup' || (address.trim().length >= 5 && (!store.zones.length || !!zone)));

  const logo = store.logo ? (
    <img src={store.logo} alt={store.name} className="h-10 w-10 shrink-0 rounded-xl bg-white/5 object-contain sm:h-11 sm:w-11" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-11 sm:w-11"><Flame className="h-5 w-5" /></span>
  );
  const bagButton = (
    <button type="button" onClick={() => setOpen(true)} aria-label={`Sacola (${count})`}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25">
      <ShoppingBag className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span key={bump} className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-in zoom-in-50 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground duration-300">{count}</span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-[calc(env(safe-area-inset-bottom)+5.5rem)] text-foreground md:pb-28">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-[72px] lg:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex min-w-0 items-center gap-2.5 text-left">
            {logo}
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-extrabold leading-tight sm:text-base">{store.name}</span>
              <span className={cn('flex items-center gap-1 text-[11px] font-semibold', store.is_open ? 'text-emerald-400' : 'text-red-400')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', store.is_open ? 'bg-emerald-400' : 'bg-red-400')} />
                {store.is_open ? 'Aberto agora' : 'Fechado'}
              </span>
            </span>
          </button>

          <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Seções">
            {[
              { label: 'Início', on: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
              { label: 'Cardápio', on: () => goTo(menuRef.current) },
              ...(promotions.length ? [{ label: 'Promoções', on: () => goTo(promoRef.current) }] : []),
              { label: 'Sobre', on: () => goTo(aboutRef.current) },
            ].map(n => (
              <button key={n.label} type="button" onClick={n.on}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">{n.label}</button>
            ))}
            {store.whatsapp && (
              <a href={waLink(store.whatsapp, 'Olá!')} target="_blank" rel="noreferrer"
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Contato</a>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <button type="button" onClick={focusSearch} aria-label="Buscar"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25">
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={() => openAccount('orders')} aria-label={userId ? 'Minha conta' : 'Entrar'}
              className={cn('hidden h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold transition-colors hover:border-white/25 md:flex', userId && 'border-primary/40')}>
              <UserRound className="h-[18px] w-[18px]" />
              <span className="max-w-[110px] truncate">{userId ? (account?.profile?.name?.split(' ')[0] ?? 'Minha conta') : 'Entrar'}</span>
            </button>
            {bagButton}
          </div>
        </div>
      </header>

      {store.notice && (
        <div className="border-b border-accent/20 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15">
          <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold sm:text-sm">
            <Megaphone className="h-4 w-4 shrink-0 text-accent" /> {store.notice}
          </p>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 lg:px-6">
        {/* ---------- Hero ---------- */}
        <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0d0d0d] sm:mt-6">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/30 blur-[110px]" />
          <div className="pointer-events-none absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-accent/20 blur-[110px]" />
          <div className="relative grid items-center gap-2 md:grid-cols-[1.05fr_1fr]">
            <div className={cn('relative z-10 order-2 px-5 pb-6 sm:px-8 sm:pb-8 md:order-1 md:py-12 lg:px-12', !heroImage && 'pt-6 sm:pt-8')}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                <Flame className="h-3.5 w-3.5" /> Qualidade que você sente
              </span>
              <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                {store.hero.title || (store.hero.highlight ? '' : 'O melhor sabor')}
                {(store.hero.title || !store.hero.highlight) && <br />}
                <span className="text-primary">{store.hero.highlight || (store.hero.title ? '' : 'na sua casa!')}</span>
              </h1>
              <p className="mt-3 max-w-md whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
                {store.hero.subtitle || `Peça agora pelo delivery ${store.name.match(/^[aeiouáéíóú]/i) ? 'do' : 'de'} ${store.name} e receba no conforto da sua casa.`}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-xs">
                {store.delivery_enabled && (
                  <span className="flex items-center gap-2"><Bike className="h-5 w-5 text-primary" /><span><b className="block font-semibold">Entrega</b><span className="text-muted-foreground">em ~{store.eta_minutes} min</span></span></span>
                )}
                {store.pickup_enabled && (
                  <span className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><span><b className="block font-semibold">Retirada</b><span className="text-muted-foreground">em ~{store.pickup_eta_minutes} min</span></span></span>
                )}
                <span className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><span><b className="block font-semibold">Pague na entrega</b><span className="text-muted-foreground">{store.payment_methods.map(m => PAYMENT_LABELS[m] ?? m).slice(0, 2).join(' ou ')}</span></span></span>
              </div>
            </div>
            <div className={cn('relative order-1 h-48 sm:h-64 md:order-2 md:h-full md:min-h-[380px]', !heroImage && 'hidden md:block')}>
              {heroImage ? (
                <>
                  <img src={heroImage} alt={heroAlt} className="absolute inset-0 h-full w-full object-cover md:[mask-image:linear-gradient(to_right,transparent,black_35%)]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/20 to-transparent md:bg-gradient-to-r md:from-[#0d0d0d] md:via-transparent" />
                </>
              ) : (
                <div className="flex h-full items-center justify-center"><UtensilsCrossed className="h-24 w-24 text-primary/40" /></div>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Entregar em + busca ---------- */}
        <section className="relative z-10 mt-4 grid gap-2 rounded-2xl border border-white/[0.06] bg-card p-2 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] md:-mt-8 md:mx-6 md:grid-cols-[minmax(0,320px)_1fr] md:gap-3 md:p-3">
          <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-muted-foreground">{mode === 'pickup' ? 'Retirar em' : 'Entregar em'}</span>
              <span className="block truncate text-sm font-semibold">
                {mode === 'pickup' ? (store.address || 'No restaurante') : (address ? [address, zone].filter(Boolean).join(' · ') : 'Informe seu endereço')}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          <form className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-1.5 pl-4" role="search" onSubmit={e => { e.preventDefault(); goTo(menuRef.current); }}>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} type="search" enterKeyHint="search"
              placeholder="Buscar por pratos, lanches, bebidas..." aria-label="Buscar no cardápio"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <button type="submit" aria-label="Buscar" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform hover:scale-105 md:flex">
              <Search className="h-[18px] w-[18px]" />
            </button>
          </form>
        </section>

        {!store.is_open && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div><p className="font-semibold">Estamos fechados no momento.</p>{store.hours_text && <p className="text-muted-foreground">{store.hours_text}</p>}</div>
          </div>
        )}

        {/* ---------- Categorias ---------- */}
        {!q && grouped.length > 1 && (
          <nav className="-mx-4 mt-6 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:gap-6 lg:mx-0 lg:justify-center lg:px-0 [&::-webkit-scrollbar]:hidden" aria-label="Categorias">
            {[{ id: 'all', name: 'Todos', image: null as string | null }, ...grouped.map(c => ({ id: c.id, name: c.name, image: c.items.find(i => i.image_url)?.image_url ?? null }))].map(c => {
              const Icon = c.id === 'all' ? LayoutGrid : categoryIcon(c.name);
              const active = activeCat === c.id;
              return (
                <button key={c.id} type="button" onClick={() => pickCategory(c.id)} className="group flex w-[72px] shrink-0 flex-col items-center gap-2 sm:w-20">
                  <span className={cn('flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 bg-white/[0.04] transition-all duration-200 sm:h-[72px] sm:w-[72px]',
                    active ? 'border-primary shadow-[0_0_0_4px_rgba(225,29,42,0.18)]' : 'border-white/10 group-hover:border-white/30')}>
                    {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" /> : <Icon className={cn('h-7 w-7', active ? 'text-primary' : 'text-muted-foreground')} />}
                  </span>
                  <span className={cn('line-clamp-1 text-center text-xs font-semibold', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>{c.name}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div ref={menuRef} className="scroll-mt-24" />

        {q ? (
          /* ---------- Resultado da busca ---------- */
          <section className="mt-8">
            <SectionTitle icon={Search} title={`Resultados para "${query.trim()}"`} subtitle={`${results.length} ${results.length === 1 ? 'item' : 'itens'}`}
              action={<Button size="sm" variant="outline" className="rounded-full border-white/10" onClick={() => setQuery('')}>Limpar</Button>} />
            {results.length ? (
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {results.map(item => <ProductCard key={item.id} item={item} qty={cart[item.id]?.qty ?? 0} disabled={!store.is_open} onAdd={() => add(item.id)} onRemove={() => setQty(item.id, -1)} />)}
              </div>
            ) : <p className="rounded-2xl border border-white/[0.06] bg-card p-8 text-center text-sm text-muted-foreground">Nada encontrado. Tente outro nome.</p>}
          </section>
        ) : (
          <>
            {/* ---------- Destaques ---------- */}
            {highlights.length > 0 && (
              <section className="mt-8">
                <SectionTitle icon={Flame} title="Destaques do cardápio" subtitle="Os favoritos da casa" />
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                  {highlights.map(item => <ProductCard key={item.id} item={item} qty={cart[item.id]?.qty ?? 0} disabled={!store.is_open} onAdd={() => add(item.id)} onRemove={() => setQty(item.id, -1)} />)}
                </div>
              </section>
            )}

            {/* ---------- Promoções (cadastradas pela loja) ---------- */}
            {promotions.length > 0 && (
              <section ref={promoRef} className="mt-10 scroll-mt-24">
                {promotions.length > 1 && <SectionTitle icon={Megaphone} title="Promoções" subtitle="Aproveite enquanto durar" />}
                <div className={cn('flex gap-4', promotions.length > 1 && '-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden')}>
                  {promotions.map(p => {
                    const linked = p.menu_item_id ? byId.get(p.menu_item_id) : undefined;
                    const photo = p.image ?? linked?.image_url ?? null;
                    return (
                      <article key={p.id} className={cn('relative shrink-0 snap-start overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-[#2a0a0c] via-[#140707] to-[#0b0b0b]',
                        promotions.length > 1 ? 'w-[88%] sm:w-[70%] lg:w-[calc(50%-0.5rem)]' : 'w-full')}>
                        <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-primary/30 blur-[90px]" />
                        <div className={cn('relative grid h-full items-center', promotions.length === 1 && 'md:grid-cols-[1.1fr_1fr]')}>
                          {photo && (
                            <img src={photo} alt={p.title} loading="lazy"
                              className={cn('h-40 w-full object-cover sm:h-48', promotions.length === 1 && 'md:order-2 md:h-full md:min-h-[260px] md:[mask-image:linear-gradient(to_right,transparent,black_35%)]')} />
                          )}
                          <div className="relative p-5 sm:p-7">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Promoção especial</p>
                            <h3 className="mt-2 text-2xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-3xl">{p.title}</h3>
                            {p.subtitle && <p className="mt-2 text-sm text-muted-foreground">{p.subtitle}</p>}
                            <div className="mt-4 flex flex-wrap items-end gap-4">
                              {linked && (
                                <p><span className="block text-xs font-semibold text-accent">Apenas</span><span className="text-3xl font-extrabold text-primary sm:text-4xl">{brl(linked.price)}</span></p>
                              )}
                              <button type="button" disabled={!!linked && !store.is_open}
                                onClick={() => (linked ? add(linked.id) : goTo(menuRef.current))}
                                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50">
                                {linked ? (cart[linked.id] ? `Na sacola (${cart[linked.id].qty}) · adicionar` : 'Aproveitar agora') : 'Ver cardápio'} <ArrowRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---------- Seções do cardápio ---------- */}
            {grouped.map(cat => {
              const showAll = expanded[cat.id] || cat.items.length <= SECTION_LIMIT;
              return (
                <section key={cat.id} ref={el => { sections.current[cat.id] = el; }} className="mt-10 scroll-mt-24">
                  <SectionTitle icon={categoryIcon(cat.name)} title={cat.name} subtitle={`${cat.items.length} ${cat.items.length === 1 ? 'opção' : 'opções'}`}
                    action={cat.items.length > SECTION_LIMIT ? (
                      <button type="button" onClick={() => setExpanded(e => ({ ...e, [cat.id]: !e[cat.id] }))}
                        className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white/30">
                        {expanded[cat.id] ? 'Ver menos' : 'Ver todos'} <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : undefined} />
                  <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {(showAll ? cat.items : cat.items.slice(0, SECTION_LIMIT)).map(item => (
                      <ProductCard key={item.id} item={item} qty={cart[item.id]?.qty ?? 0} disabled={!store.is_open} onAdd={() => add(item.id)} onRemove={() => setQty(item.id, -1)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}

        {/* ---------- Sobre ---------- */}
        <footer ref={aboutRef} className="mt-14 scroll-mt-24 rounded-3xl border border-white/[0.06] bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">{logo}<p className="text-lg font-extrabold">{store.name}</p></div>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            {store.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {store.address}</p>}
            {store.hours_text && <p className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {store.hours_text}</p>}
            {store.whatsapp && (
              <a href={waLink(store.whatsapp, 'Olá!')} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-foreground">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Falar no WhatsApp
              </a>
            )}
          </div>
        </footer>
      </main>

      {/* ---------- Barra da sacola (computador) ---------- */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 hidden justify-center px-4 md:flex">
          <button type="button" onClick={() => setOpen(true)}
            className="flex w-full max-w-md animate-in slide-in-from-bottom-4 items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-[0_20px_40px_-12px_rgba(225,29,42,0.7)] transition-transform hover:scale-[1.02]">
            <span className="flex items-center gap-2 font-bold"><ShoppingBag className="h-5 w-5" /> Ver sacola · {count} {count === 1 ? 'item' : 'itens'}</span>
            <span className="font-extrabold">{brl(subtotal)}</span>
          </button>
        </div>
      )}

      {/* ---------- Celular: sacola + navegação inferior ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        {count > 0 && (
          <div className="px-3 pb-2">
            <button type="button" onClick={() => setOpen(true)}
              className="flex w-full animate-in slide-in-from-bottom-4 items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-[0_14px_30px_-10px_rgba(225,29,42,0.8)]">
              <span className="flex items-center gap-2 text-sm font-bold"><ShoppingBag className="h-5 w-5" /> Ver sacola ({count})</span>
              <span className="text-sm font-extrabold">{brl(subtotal)}</span>
            </button>
          </div>
        )}
        <nav className="grid grid-cols-4 border-t border-white/[0.06] bg-[#070707]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Navegação">
          {[
            { label: 'Início', icon: Home, on: () => { setActiveCat('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, active: activeCat === 'all' && !q },
            { label: 'Cardápio', icon: UtensilsCrossed, on: () => goTo(menuRef.current), active: activeCat !== 'all' && !q },
            { label: 'Pedidos', icon: ReceiptText, on: () => openAccount('orders'), active: accountOpen && accountTab === 'orders' },
            { label: userId ? 'Perfil' : 'Entrar', icon: UserRound, on: () => openAccount('profile'), active: accountOpen && accountTab === 'profile' },
          ].map(n => (
            <button key={n.label} type="button" onClick={n.on}
              className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors', n.active ? 'text-primary' : 'text-muted-foreground')}>
              <span className="relative">
                <n.icon className="h-5 w-5" />
              </span>
              {n.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ---------- Sacola / finalizar pedido ---------- */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={isMobile ? 'bottom' : 'right'}
          className={cn('flex flex-col gap-0 border-white/[0.06] bg-[#0b0b0b] p-0',
            isMobile ? 'max-h-[94dvh] rounded-t-3xl' : 'w-full sm:max-w-md')}>
          {isMobile && <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-white/15" />}
          <SheetHeader className="px-5 pb-3 pt-4 text-left">
            <SheetTitle className="text-xl font-extrabold">Sua sacola</SheetTitle>
            <p className="text-xs text-muted-foreground">{store.name}</p>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5">
            {!lines.length && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-muted-foreground">
                <ShoppingBag className="h-8 w-8" /> Sua sacola está vazia.
              </div>
            )}
            {!!lines.length && (
              <ul className="space-y-3">
                {lines.map(l => (
                  <li key={l.item!.id} className="rounded-2xl border border-white/[0.06] bg-card p-3">
                    <div className="flex items-center gap-3">
                      {l.item!.image_url
                        ? <img src={l.item!.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                        : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{l.item!.name}</p>
                        <p className="text-sm font-bold">{brl(l.item!.price * l.qty)}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-0.5">
                        <button type="button" aria-label="Menos" onClick={() => setQty(l.item!.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                        <button type="button" aria-label="Mais" onClick={() => setQty(l.item!.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <Input value={l.notes} maxLength={300} placeholder="Observação (ex.: sem cebola)" className="mt-2 h-9 rounded-xl border-white/10 bg-white/[0.03] text-xs"
                      onChange={e => setCart(prev => ({ ...prev, [l.item!.id]: { ...prev[l.item!.id], notes: e.target.value } }))} />
                  </li>
                ))}
              </ul>
            )}

            {store.delivery_enabled && store.pickup_enabled && (
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.04] p-1">
                {([['delivery', 'Entrega', Bike], ['pickup', 'Retirar no local', Store]] as const).map(([k, l, Icon]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={cn('flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors', mode === k ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-4 w-4" /> {l}
                  </button>
                ))}
              </div>
            )}

            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Seus dados</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="os-name">Seu nome *</Label>
                  <Input id="os-name" value={name} maxLength={80} autoComplete="name" className="h-11 rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="os-phone">WhatsApp *</Label>
                  <Input id="os-phone" value={phone} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" className="h-11 rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setPhone(formatPhone(e.target.value))} />
                </div>
              </div>
            </fieldset>

            {mode === 'delivery' ? (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Endereço de entrega</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="os-address">Rua e número *</Label>
                  <Input id="os-address" value={address} maxLength={200} autoComplete="street-address" className="h-11 rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setAddress(e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="os-comp">Complemento / referência</Label>
                    <Input id="os-comp" value={complement} maxLength={90} className="h-11 rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setComplement(e.target.value)} />
                  </div>
                  {store.zones.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Bairro *</Label>
                      <Select value={zone} onValueChange={setZone}>
                        <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/[0.03]"><SelectValue placeholder="Escolha o bairro" /></SelectTrigger>
                        <SelectContent>
                          {store.zones.map(z => <SelectItem key={z.name} value={z.name}>{z.name} · {z.fee > 0 ? brl(z.fee) : 'grátis'}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </fieldset>
            ) : (
              <p className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-card p-4 text-sm">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Retire em <strong>{store.address || 'nosso endereço'}</strong> · pronto em cerca de {store.pickup_eta_minutes} min.</span>
              </p>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pagamento na {mode === 'pickup' ? 'retirada' : 'entrega'} *</legend>
              <div className="grid grid-cols-2 gap-2">
                {store.payment_methods.map(m => (
                  <button key={m} type="button" onClick={() => setPayment(m)}
                    className={cn('rounded-xl border px-3 py-3 text-sm font-semibold transition-colors',
                      payment === m ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground')}>
                    {PAYMENT_LABELS[m] ?? m}
                  </button>
                ))}
              </div>
              {payment === 'cash' && (
                <Input value={changeFor} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="h-11 rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setChangeFor(e.target.value.replace(/[^\d,.]/g, ''))} />
              )}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="os-notes">Observações do pedido</Label>
              <Textarea id="os-notes" value={notes} maxLength={500} rows={2} className="rounded-xl border-white/10 bg-white/[0.03]" onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Resumo + botão sempre visíveis */}
          <div className="space-y-3 border-t border-white/[0.06] bg-[#0b0b0b] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              {mode === 'delivery' && (
                <div className="flex justify-between text-muted-foreground"><span>Entrega</span><span>{store.zones.length && !zone ? 'escolha o bairro' : fee > 0 ? brl(fee) : 'grátis'}</span></div>
              )}
              <div className="flex justify-between pt-1 text-lg font-extrabold"><span>Total</span><span>{brl(total)}</span></div>
              {belowMin && <p className="text-xs font-semibold text-red-400">Pedido mínimo: {brl(store.min_order)}</p>}
            </div>
            {userId ? (
              <Button size="lg" className="h-12 w-full gap-2 rounded-2xl text-base font-bold shadow-[0_14px_30px_-12px_rgba(225,29,42,0.8)]" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {store.is_open ? `Fazer pedido · ${brl(total)}` : 'Loja fechada'}
              </Button>
            ) : (
              <>
                <Button size="lg" className="h-12 w-full gap-2 rounded-2xl text-base font-bold shadow-[0_14px_30px_-12px_rgba(225,29,42,0.8)]"
                  disabled={!count || !store.is_open} onClick={() => { setAfterLogin('bag'); setAuthOpen(true); }}>
                  <UserRound className="h-4 w-4" /> Entrar para fazer o pedido
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">Crie sua conta ou entre para enviar o pedido e acompanhar a entrega.</p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StoreAuthDialog open={authOpen} onOpenChange={setAuthOpen} slug={slug} storeName={store.name}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['store-account', slug] });
          if (afterLogin === 'bag') setOpen(true);
          else if (afterLogin) { setAccountTab(afterLogin); setAccountOpen(true); }
          setAfterLogin(null);
        }} />
      <StoreAccountSheet open={accountOpen} onOpenChange={setAccountOpen} side={isMobile ? 'bottom' : 'right'} slug={slug}
        account={account} loading={accountLoading} tab={accountTab} onTab={setAccountTab}
        onSaved={() => qc.invalidateQueries({ queryKey: ['store-account', slug] })} />
    </div>
  );
}
