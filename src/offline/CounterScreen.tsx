import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bike, Plus, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl } from './api';
import { useHub } from './OfflineApp';
import OrderPanel from './OrderPanel';

/** Pedidos sem mesa: balcão (retirada) e delivery por telefone. */
export default function CounterScreen() {
  const { state, op } = useHub();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [type, setType] = useState<'takeaway' | 'delivery'>('takeaway');
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', customer_address: '' });

  const open = state.orders.filter(o => !o.table_id);
  const current = orderId ? state.orders.find(o => o.id === orderId) : null;
  if (current) {
    const label = current.order_type === 'delivery' ? 'Delivery' : 'Balcão';
    return <OrderPanel order={current} title={`${label}${current.customer_name ? ` · ${current.customer_name}` : ''}`} onBack={() => setOrderId(null)} />;
  }

  const create = async () => {
    if (type === 'delivery' && (!form.customer_name.trim() || !form.customer_address.trim())) return;
    const data = await op('order.open', { order_type: type, customer_name: form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null, customer_address: type === 'delivery' ? form.customer_address.trim() : null });
    if (data?.id) { setOrderId(data.id); setForm({ customer_name: '', customer_phone: '', customer_address: '' }); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">Novo pedido</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {([['takeaway', 'Balcão', ShoppingBag], ['delivery', 'Delivery', Bike]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setType(k)}
              className={cn('flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold', type === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              <Icon className="h-4 w-4" /> {l}
            </button>
          ))}
        </div>
        <Input value={form.customer_name} maxLength={80} placeholder={type === 'delivery' ? 'Nome do cliente *' : 'Nome do cliente (opcional)'}
          onChange={e => setForm({ ...form, customer_name: e.target.value })} />
        <Input value={form.customer_phone} maxLength={20} inputMode="tel" placeholder="Telefone" onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
        {type === 'delivery' && (
          <Input value={form.customer_address} maxLength={300} placeholder="Endereço de entrega *" onChange={e => setForm({ ...form, customer_address: e.target.value })} />
        )}
        <Button className="h-11 w-full gap-2 font-bold" onClick={create}
          disabled={type === 'delivery' && (!form.customer_name.trim() || !form.customer_address.trim())}>
          <Plus className="h-4 w-4" /> Criar e lançar itens
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Em aberto</h2>
        {!open.length && <p className="text-sm text-muted-foreground">Nenhum pedido de balcão ou delivery aberto.</p>}
        {open.map(o => (
          <button key={o.id} type="button" onClick={() => setOrderId(o.id)}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left hover:border-primary">
            {o.order_type === 'delivery' ? <Bike className="h-5 w-5 text-primary" /> : <ShoppingBag className="h-5 w-5 text-primary" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{o.customer_name || (o.order_type === 'delivery' ? 'Delivery' : 'Balcão')}</span>
              <span className="block truncate text-xs text-muted-foreground">{o.items.filter(i => i.status !== 'cancelled').map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Sem itens'}</span>
            </span>
            <span className="text-sm font-bold">{brl(o.total - o.paid)}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
