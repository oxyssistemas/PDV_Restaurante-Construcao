import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChefHat, CloudOff, CloudUpload, Delete, Loader2, LogOut, ReceiptText, RefreshCw, ShoppingBag, UtensilsCrossed, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, AuthError, getToken, ROLE_LABELS, setToken, subscribe, type Hello, type HubState, type OpData, type Staff } from './api';
import TablesScreen from './TablesScreen';
import KitchenScreen from './KitchenScreen';
import CashierScreen from './CashierScreen';
import CounterScreen from './CounterScreen';
import PrinterAgent from './PrinterAgent';

type Hub = { state: HubState; op: (type: string, data: Record<string, unknown>) => Promise<OpData | null>; refresh: () => void };
const HubContext = createContext<Hub | null>(null);
export const useHub = () => useContext(HubContext)!;

type Tab = 'mesas' | 'balcao' | 'cozinha' | 'caixa';
const TABS: { key: Tab; label: string; icon: typeof UtensilsCrossed; roles: string[] }[] = [
  { key: 'mesas', label: 'Mesas', icon: UtensilsCrossed, roles: ['admin', 'cashier', 'waiter'] },
  { key: 'balcao', label: 'Balcão / Delivery', icon: ShoppingBag, roles: ['admin', 'cashier', 'delivery'] },
  { key: 'cozinha', label: 'Cozinha', icon: ChefHat, roles: ['admin', 'kitchen', 'cashier'] },
  { key: 'caixa', label: 'Caixa', icon: ReceiptText, roles: ['admin', 'cashier', 'finance'] },
];

export default function OfflineApp() {
  // Janela escondida da central que imprime as vias (aberta pelo app de computador).
  if (window.location.hash === '#/impressora') return <PrinterAgent />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <Main />
    </div>
  );
}

function Main() {
  const [hello, setHello] = useState<Hello | null>(null);
  const [state, setState] = useState<HubState | null>(null);
  const [logged, setLogged] = useState(!!getToken());
  const [helloError, setHelloError] = useState(false);

  const loadHello = useCallback(() => api.hello().then(h => { setHello(h); setHelloError(false); }).catch(() => setHelloError(true)), []);
  const refresh = useCallback(() => {
    if (!getToken()) return;
    api.state().then(setState).catch(e => { if (e instanceof AuthError) { setLogged(false); setState(null); } });
  }, []);

  useEffect(() => { loadHello(); }, [loadHello]);
  useEffect(() => {
    if (!logged) return;
    refresh();
    const stop = subscribe(() => refresh());
    const t = setInterval(refresh, 15_000); // rede de segurança se os avisos caírem
    return () => { stop(); clearInterval(t); };
  }, [logged, refresh]);

  const op = useCallback(async (type: string, data: Record<string, unknown>) => {
    try {
      const { op } = await api.op(type, data);
      refresh();
      return op.data;
    } catch (e) {
      if (e instanceof AuthError) setLogged(false);
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar');
      return null;
    }
  }, [refresh]);

  if (helloError) {
    return (
      <Centered>
        <CloudOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-bold">Central não encontrada</p>
        <p className="max-w-sm text-sm text-muted-foreground">Confira se o computador do caixa está ligado com o app Oxys aberto e se este aparelho está no mesmo Wi-Fi.</p>
        <Button variant="outline" className="gap-2" onClick={loadHello}><RefreshCw className="h-4 w-4" /> Tentar de novo</Button>
      </Centered>
    );
  }
  if (!hello) return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /></Centered>;
  if (!hello.ready) {
    return (
      <Centered>
        <CloudOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-bold">A central ainda não baixou os dados da loja</p>
        <p className="max-w-sm text-sm text-muted-foreground">Ela precisa de internet pelo menos uma vez depois de ativada.</p>
      </Centered>
    );
  }
  if (!logged || !state) {
    return logged && !state
      ? <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /></Centered>
      : <Login hello={hello} onLogged={() => setLogged(true)} />;
  }
  return (
    <HubContext.Provider value={{ state, op, refresh }}>
      <Shell onLogout={async () => { await api.logout(); setToken(null); setLogged(false); setState(null); }} />
    </HubContext.Provider>
  );
}

const Centered = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">{children}</main>
);

function Login({ hello, onLogged }: { hello: Hello; onLogged: () => void }) {
  const [who, setWho] = useState<Staff | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = [...hello.staff].sort((a, b) => a.name.localeCompare(b.name));

  const submit = async (value = pin) => {
    if (!who || value.length < 4) return;
    setBusy(true);
    try {
      const { token } = await api.login(who.user_id, value);
      setToken(token);
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível entrar');
      setPin('');
    } finally { setBusy(false); }
  };
  const press = (d: string) => { if (pin.length < 8) setPin(p => p + d); };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-5">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
          <CloudOff className="h-3.5 w-3.5" /> Modo offline
        </span>
        <h1 className="mt-3 text-2xl font-extrabold">{hello.restaurant?.name}</h1>
        <p className="text-sm text-muted-foreground">{who ? `Olá, ${who.name.split('@')[0]}! Digite o PIN da central.` : 'Quem está usando este aparelho?'}</p>
      </div>

      {!who ? (
        <div className="grid gap-2">
          {staff.map(s => (
            <button key={s.user_id + s.role} type="button" onClick={() => setWho(s)}
              className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary">
              <span className="truncate font-semibold">{s.name}</span>
              <span className="ml-3 shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[s.role] ?? s.role}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center gap-3">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={cn('h-4 w-4 rounded-full border-2', i < pin.length ? 'border-primary bg-primary' : 'border-border')} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
              <Button key={d} variant="outline" className="h-14 text-xl font-bold" onClick={() => press(d)}>{d}</Button>
            ))}
            <Button variant="ghost" className="h-14" onClick={() => { setWho(null); setPin(''); }}>Voltar</Button>
            <Button variant="outline" className="h-14 text-xl font-bold" onClick={() => press('0')}>0</Button>
            <Button variant="ghost" className="h-14" aria-label="Apagar" onClick={() => setPin(p => p.slice(0, -1))}><Delete className="h-5 w-5" /></Button>
          </div>
          <Button className="h-12 w-full text-base font-bold" disabled={pin.length < 4 || busy} onClick={() => submit()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
          </Button>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">O PIN foi definido por quem ativou a central no computador do caixa.</p>
    </main>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { state } = useHub();
  const tabs = TABS.filter(t => t.roles.includes(state.me.role));
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'mesas');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-[#111827]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{state.restaurant?.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{state.me.name} · {ROLE_LABELS[state.me.role] ?? state.me.role}</p>
          </div>
          <SyncPill />
          <Button size="icon" variant="ghost" aria-label="Sair" onClick={onLogout}><LogOut className="h-4 w-4" /></Button>
        </div>
        {tabs.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 p-3 sm:p-4">
        {tab === 'mesas' && <TablesScreen />}
        {tab === 'balcao' && <CounterScreen />}
        {tab === 'cozinha' && <KitchenScreen />}
        {tab === 'caixa' && <CashierScreen />}
      </main>
    </div>
  );
}

function SyncPill() {
  const { state } = useHub();
  if (state.online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
        {state.pendingOps ? <CloudUpload className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
        {state.pendingOps ? `Enviando ${state.pendingOps}` : 'Internet ok'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
      <CloudOff className="h-3.5 w-3.5" /> Sem internet{state.pendingOps ? ` · ${state.pendingOps} a enviar` : ''}
    </span>
  );
}
