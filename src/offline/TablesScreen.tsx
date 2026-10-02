import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl, type Table } from './api';
import { useHub } from './OfflineApp';
import OrderPanel from './OrderPanel';

/** Mapa de mesas: abre comanda, lança itens na comanda da mesa. */
export default function TablesScreen() {
  const { state, op } = useHub();
  const [table, setTable] = useState<Table | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const ordersOf = (t: Table) => state.orders.filter(o => o.table_id === t.id);
  const current = orderId ? state.orders.find(o => o.id === orderId) : null;

  if (current) {
    const t = state.tables.find(x => x.id === current.table_id);
    return <OrderPanel order={current} title={`Mesa ${t?.number ?? '?'}${current.customer_name ? ` · ${current.customer_name}` : ''}`} onBack={() => setOrderId(null)} />;
  }

  const open = async () => {
    if (!table) return;
    const data = await op('order.open', { table_id: table.id, customer_name: name.trim() || null, order_type: 'dine_in' });
    if (data?.id) { setOrderId(data.id); setTable(null); setName(''); }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {state.tables.map(t => {
          const os = ordersOf(t);
          const total = os.reduce((s, o) => s + o.total - o.paid, 0);
          const busy = os.length > 0 || t.status === 'occupied';
          return (
            <button key={t.id} type="button" onClick={() => (os.length === 1 ? setOrderId(os[0].id) : setTable(t))}
              className={cn('flex aspect-square flex-col items-center justify-center rounded-2xl border-2 p-2 transition-colors',
                busy ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50')}>
              <span className="text-2xl font-extrabold">{t.number}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">{busy ? (total > 0 ? brl(total) : 'Ocupada') : 'Livre'}</span>
              {os.length > 1 && <span className="text-[10px] font-semibold text-primary">{os.length} comandas</span>}
            </button>
          );
        })}
        {!state.tables.length && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Nenhuma mesa cadastrada.</p>}
      </div>

      <Dialog open={!!table} onOpenChange={o => { if (!o) { setTable(null); setName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Mesa {table?.number}</DialogTitle></DialogHeader>
          {table && ordersOf(table).length > 0 && (
            <div className="space-y-2">
              {ordersOf(table).map(o => (
                <button key={o.id} type="button" onClick={() => { setOrderId(o.id); setTable(null); }}
                  className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-primary">
                  <span className="text-sm font-semibold">{o.customer_name || 'Comanda'}</span>
                  <span className="text-sm">{brl(o.total - o.paid)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Input value={name} maxLength={80} placeholder="Nome do cliente (opcional)" onChange={e => setName(e.target.value)} />
            <Button className="h-11 w-full gap-2 font-bold" onClick={open}><Plus className="h-4 w-4" /> Abrir comanda</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
