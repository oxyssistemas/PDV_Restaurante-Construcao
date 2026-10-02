import { Button } from '@/components/ui/button';
import { Bike, CheckCircle2, Clock, Flame, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from './api';
import { useHub } from './OfflineApp';

const mins = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
const wait = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

/** Cozinha: pedidos com itens na fila ou em preparo; um toque inicia, outro marca pronto. */
export default function KitchenScreen() {
  const { state, op } = useHub();
  const tableNumber = (o: Order) => state.tables.find(t => t.id === o.table_id)?.number;
  const tickets = state.orders
    .map(o => ({ o, items: o.items.filter(i => i.status === 'pending' || i.status === 'preparing') }))
    .filter(t => t.items.length)
    .sort((a, b) => Date.parse(a.items[0].created_at) - Date.parse(b.items[0].created_at));

  const setAll = async (o: Order, from: string[], to: string) => {
    for (const i of o.items.filter(x => from.includes(x.status))) await op('item.status', { item_id: i.id, status: to });
  };

  if (!tickets.length) {
    return <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground"><CheckCircle2 className="h-10 w-10" /> Nenhum pedido na fila.</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tickets.map(({ o, items }) => {
        const m = mins(items[0].created_at);
        const preparing = items.every(i => i.status === 'preparing');
        const Icon = o.order_type === 'delivery' ? Bike : o.table_id ? UtensilsCrossed : ShoppingBag;
        return (
          <article key={o.id} className={cn('flex flex-col rounded-2xl border-2 bg-card p-3', m >= 15 ? 'border-red-500/60' : preparing ? 'border-amber-500/50' : 'border-border')}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 font-bold">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{o.table_id ? `Mesa ${tableNumber(o) ?? '?'}` : o.order_type === 'delivery' ? 'Delivery' : 'Balcão'}{o.customer_name ? ` · ${o.customer_name}` : ''}</span>
              </p>
              <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', m >= 15 ? 'bg-red-500/15 text-red-400' : m >= 8 ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')}>
                <Clock className="h-3 w-3" /> {wait(m)}
              </span>
            </div>
            <ul className="my-3 flex-1 space-y-1.5">
              {items.map(i => (
                <li key={i.id}>
                  <button type="button" onClick={() => op('item.status', { item_id: i.id, status: i.status === 'pending' ? 'preparing' : 'ready' })}
                    className="w-full rounded-lg px-1 py-0.5 text-left hover:bg-muted">
                    <span className="text-base"><b className="text-primary">{i.quantity}x</b> {i.name}</span>
                    {i.status === 'preparing' && <span className="ml-2 text-[10px] font-bold text-amber-400">EM PREPARO</span>}
                    {i.notes && <span className="block text-xs font-semibold text-amber-400">⚠ {i.notes}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 gap-1" disabled={preparing} onClick={() => setAll(o, ['pending'], 'preparing')}><Flame className="h-4 w-4" /> Iniciar</Button>
              <Button className="h-11 gap-1" onClick={() => setAll(o, ['pending', 'preparing'], 'ready')}><CheckCircle2 className="h-4 w-4" /> Pronto</Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
