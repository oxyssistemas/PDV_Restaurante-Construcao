import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bike, Loader2, ReceiptText, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl, PAYMENT_LABELS, type Order } from './api';
import { useHub } from './OfflineApp';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => Number(v.replace(',', '.')) || 0;

/** Caixa: recebe pagamento (pode dividir em várias formas), fecha a conta e libera a mesa. Recibo sai na central. */
export default function CashierScreen() {
  const { state, op } = useHub();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);

  const label = (o: Order) => o.table_id
    ? `Mesa ${state.tables.find(t => t.id === o.table_id)?.number ?? '?'}${o.customer_name ? ` · ${o.customer_name}` : ''}`
    : `${o.order_type === 'delivery' ? 'Delivery' : 'Balcão'}${o.customer_name ? ` · ${o.customer_name}` : ''}`;
  const open = state.orders.filter(o => o.items.some(i => i.status !== 'cancelled') && o.total - o.paid > 0.009);
  const order = orderId ? state.orders.find(o => o.id === orderId) ?? null : null;
  const due = order ? round2(order.total - order.paid) : 0;
  const value = amount ? round2(num(amount)) : due;
  const change = method === 'cash' && received ? round2(Math.max(0, num(received) - value)) : 0;

  const select = (o: Order) => { setOrderId(o.id); setAmount(''); setReceived(''); setMethod('cash'); };

  const pay = async () => {
    if (!order || value <= 0) return;
    setBusy(true);
    try {
      const ok = await op('payment.add', { order_id: order.id, method, amount: value, change_amount: change });
      if (!ok) return;
      if (value + 0.009 >= due) {
        await op('order.settle', { order_id: order.id });
        // libera a mesa quando não sobrou comanda aberta nela
        if (order.table_id && !state.orders.some(o => o.id !== order.id && o.table_id === order.table_id)) {
          await op('table.status', { table_id: order.table_id, status: 'free' });
        }
        setOrderId(null);
      }
      setAmount(''); setReceived('');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <section className="space-y-2">
        {!open.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma conta aberta.</p>}
        {open.map(o => {
          const Icon = o.order_type === 'delivery' ? Bike : o.table_id ? UtensilsCrossed : ShoppingBag;
          return (
            <button key={o.id} type="button" onClick={() => select(o)}
              className={cn('flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors', orderId === o.id ? 'border-primary' : 'hover:border-primary/50')}>
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{label(o)}</span>
                <span className="text-xs text-muted-foreground">Total {brl(o.total)}{o.paid > 0 && ` · pago ${brl(o.paid)}`}</span>
              </span>
              <span className="text-base font-extrabold">{brl(o.total - o.paid)}</span>
            </button>
          );
        })}
      </section>

      <aside className="rounded-2xl border bg-card p-4 lg:sticky lg:top-28 lg:self-start">
        {!order ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><ReceiptText className="h-8 w-8" /> Escolha uma conta para receber.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">{label(order)}</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {order.items.filter(i => i.status !== 'cancelled').map(i => (
                  <li key={i.id} className="flex justify-between gap-2"><span>{i.quantity}x {i.name}</span><span>{brl(i.quantity * i.unit_price)}</span></li>
                ))}
              </ul>
              <div className="mt-2 space-y-0.5 border-t pt-2 text-sm">
                <div className="flex justify-between"><span>Total</span><b>{brl(order.total)}</b></div>
                {order.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-muted-foreground"><span>{PAYMENT_LABELS[p.method] ?? p.method}</span><span>- {brl(p.amount)}</span></div>
                ))}
                <div className="flex justify-between text-base font-extrabold"><span>Falta</span><span>{brl(due)}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {Object.entries(PAYMENT_LABELS).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMethod(k)}
                  className={cn('rounded-lg border py-2 text-xs font-semibold', method === k ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground')}>{l}</button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">Valor desta forma
                <Input inputMode="decimal" value={amount} placeholder={due.toFixed(2).replace('.', ',')} onChange={e => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} />
              </label>
              {method === 'cash' && (
                <label className="space-y-1 text-xs text-muted-foreground">Recebido em dinheiro
                  <Input inputMode="decimal" value={received} placeholder="0,00" onChange={e => setReceived(e.target.value.replace(/[^\d,.]/g, ''))} />
                </label>
              )}
            </div>
            {change > 0 && <p className="text-sm font-semibold text-emerald-400">Troco: {brl(change)}</p>}
            <Button className="h-12 w-full text-base font-bold" disabled={busy || value <= 0 || value - due > 0.009} onClick={pay}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {value + 0.009 >= due ? `Receber ${brl(value)} e fechar` : `Receber ${brl(value)} (parcial)`}
            </Button>
            {state.fiscalAutoEmit && <p className="text-[11px] text-muted-foreground">A NFC-e desta venda é emitida automaticamente quando a internet voltar.</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
