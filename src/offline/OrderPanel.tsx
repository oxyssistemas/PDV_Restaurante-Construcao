import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Minus, Plus, Search, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl, type Order } from './api';
import { useHub } from './OfflineApp';

const ITEM_STATUS: Record<string, [string, string]> = {
  pending: ['Na fila', 'bg-white/10 text-foreground'],
  preparing: ['Em preparo', 'bg-amber-500/15 text-amber-400'],
  ready: ['Pronto', 'bg-emerald-500/15 text-emerald-400'],
  delivered: ['Entregue', 'bg-sky-500/15 text-sky-400'],
  cancelled: ['Cancelado', 'bg-red-500/15 text-red-400'],
};

type Line = { menu_item_id: string; quantity: number; notes: string };

/** Comanda: itens já lançados + cardápio para lançar mais (vai para a cozinha e imprime na central). */
export default function OrderPanel({ order, title, onBack }: { order: Order; title: string; onBack: () => void }) {
  const { state, op } = useHub();
  const [cart, setCart] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sending, setSending] = useState(false);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    return state.items.filter(i => (cat === 'all' || i.category_id === cat) && (!n || i.name.toLowerCase().includes(n)));
  }, [state.items, q, cat]);
  const byId = useMemo(() => new Map(state.items.map(i => [i.id, i])), [state.items]);
  const cartTotal = cart.reduce((s, l) => s + (byId.get(l.menu_item_id)?.price ?? 0) * l.quantity, 0);

  const add = (id: string) => setCart(c => {
    const found = c.find(l => l.menu_item_id === id && !l.notes);
    return found ? c.map(l => (l === found ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { menu_item_id: id, quantity: 1, notes: '' }];
  });
  const change = (i: number, delta: number) => setCart(c => c.flatMap((l, j) => (j !== i ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }])));

  const send = async () => {
    if (!cart.length) return;
    setSending(true);
    const ok = await op('items.add', { order_id: order.id, items: cart });
    setSending(false);
    if (ok) setCart([]);
  };

  const live = order.items.filter(i => i.status !== 'cancelled');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Voltar" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">Total {brl(order.total)}{order.paid > 0 && ` · pago ${brl(order.paid)}`}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Cardápio */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar no cardápio" className="h-11 pl-9" />
          </div>
          {state.categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[{ id: 'all', name: 'Todos' }, ...state.categories].map(c => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)}
                  className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-semibold', cat === c.id ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground')}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map(i => (
              <button key={i.id} type="button" onClick={() => add(i.id)}
                className="flex min-h-[72px] flex-col justify-between rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary active:scale-[0.98]">
                <span className="line-clamp-2 text-sm font-semibold leading-tight">{i.name}</span>
                <span className="mt-1 text-sm font-bold text-primary">{brl(i.price)}</span>
              </button>
            ))}
            {!items.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
          </div>
        </section>

        {/* Comanda */}
        <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
          {cart.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">A enviar</p>
              {cart.map((l, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{byId.get(l.menu_item_id)?.name}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Menos" onClick={() => change(i, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                    <span className="w-5 text-center font-bold">{l.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Mais" onClick={() => change(i, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Input value={l.notes} maxLength={300} placeholder="Observação" className="h-8 text-xs"
                    onChange={e => setCart(c => c.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))} />
                </div>
              ))}
              <Button className="h-11 w-full gap-2 font-bold" disabled={sending} onClick={send}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para a cozinha · {brl(cartTotal)}
              </Button>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Já lançado</p>
            {!live.length ? <p className="text-sm text-muted-foreground">Nenhum item ainda. Toque no cardápio para adicionar.</p> : (
              <ul className="space-y-1.5">
                {live.map(i => {
                  const [label, tone] = ITEM_STATUS[i.status] ?? [i.status, 'bg-white/10'];
                  return (
                    <li key={i.id} className="flex items-start gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <b className="text-primary">{i.quantity}x</b> {i.name}
                        {i.notes && <span className="block text-[11px] text-amber-400">{i.notes}</span>}
                      </span>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', tone)}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
