import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = { id: string; name: string; quantity: number; unit_price: number };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Dividir a conta: em partes iguais (por pessoa) ou pelos itens que cada um consumiu.
 * Por item, a taxa de serviço/couvert/descontos entram na mesma proporção do total.
 */
export default function SplitBillDialog({ open, onOpenChange, due, total, itemsTotal, items, onApply }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** saldo a pagar agora */ due: number;
  /** total da conta (com taxas) e só dos itens, para a proporção */ total: number; itemsTotal: number;
  items: Item[];
  onApply: (amount: number, label: string) => void;
}) {
  const [mode, setMode] = useState<'equal' | 'items'>('equal');
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (open) setPicked([]); }, [open]);

  const share = round2(due / Math.max(1, people));
  const factor = itemsTotal > 0 ? total / itemsTotal : 1;
  const byItems = round2(Math.min(due, items.filter(i => picked.includes(i.id)).reduce((s, i) => s + i.quantity * i.unit_price, 0) * factor));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Dividir a conta</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {([['equal', 'Partes iguais'], ['items', 'Por item']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
              className={cn('rounded-lg py-2 text-sm font-medium', mode === k ? 'bg-background shadow' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        {mode === 'equal' ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm text-muted-foreground">Saldo de {brl(due)} dividido por</p>
            <div className="flex items-center justify-center gap-3">
              <Button size="icon" variant="outline" aria-label="Menos pessoas" onClick={() => setPeople(p => Math.max(2, p - 1))}><Minus className="h-4 w-4" /></Button>
              <span className="w-16 text-3xl font-bold">{people}</span>
              <Button size="icon" variant="outline" aria-label="Mais pessoas" onClick={() => setPeople(p => Math.min(50, p + 1))}><Plus className="h-4 w-4" /></Button>
            </div>
            <p className="text-lg">Cada um paga <b>{brl(share)}</b></p>
          </div>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {items.map(i => (
              <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={picked.includes(i.id)} onCheckedChange={v => setPicked(p => v ? [...p, i.id] : p.filter(x => x !== i.id))} />
                <span className="min-w-0 flex-1 truncate">{i.quantity}x {i.name}</span>
                <span className="text-muted-foreground">{brl(i.quantity * i.unit_price)}</span>
              </label>
            ))}
            <p className="pt-2 text-right text-sm">Com taxas na mesma proporção: <b>{brl(byItems)}</b></p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={mode === 'items' ? byItems <= 0 : share <= 0}
            onClick={() => { onApply(mode === 'equal' ? share : byItems, mode === 'equal' ? `1 de ${people} pessoas` : 'itens escolhidos'); onOpenChange(false); }}>
            Usar no próximo pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
