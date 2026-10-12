import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultSelection, quoteItem, type OptionGroup } from '@/lib/menuOptions';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type PickedItem = { options: string[]; options_text: string | null; price: number; quantity: number; notes: string };

type Props = {
  item: { id: string; name: string; price: number; description?: string | null } | null;
  groups: OptionGroup[];
  /** preço zero (prato incluso no rodízio) */
  free?: boolean;
  withNotes?: boolean;
  onClose: () => void;
  onConfirm: (picked: PickedItem) => void;
};

function rule(g: OptionGroup) {
  if (g.kind === 'size') return g.min_select ? 'Escolha 1' : 'Opcional';
  if (g.kind === 'flavor') return g.max_select > 1 ? `Até ${g.max_select} sabores` : 'Escolha 1';
  if (g.min_select && g.min_select === g.max_select) return `Escolha ${g.min_select}`;
  if (g.min_select) return `Escolha de ${g.min_select} a ${g.max_select}`;
  return g.max_select > 1 ? `Até ${g.max_select}` : 'Opcional';
}

/** Escolha de tamanho, sabores (meio a meio) e adicionais de um prato, com o preço atualizado na hora. */
export default function OptionPicker({ item, groups, free = false, withNotes = true, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) { setSelected(defaultSelection(groups)); setQty(1); setNotes(''); }
  }, [item, groups]);

  if (!item) return null;
  const quote = quoteItem(Number(item.price), groups, selected);
  const unit = free ? 0 : quote.price;

  const toggle = (g: OptionGroup, id: string) => setSelected(prev => {
    const inGroup = prev.filter(x => g.options.some(o => o.id === x));
    if (prev.includes(id)) return prev.filter(x => x !== id);
    if (g.max_select === 1) return [...prev.filter(x => !inGroup.includes(x)), id];
    if (inGroup.length >= g.max_select) return prev;
    return [...prev, id];
  });

  const sizeRatio = (() => {
    const size = groups.find(g => g.kind === 'size');
    const o = size?.options.find(x => selected.includes(x.id));
    return o && Number(item.price) > 0 ? o.price / Number(item.price) : 1;
  })();

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        </DialogHeader>
        <div className="space-y-5">
          {groups.map(g => {
            const count = g.options.filter(o => selected.includes(o.id)).length;
            return (
              <section key={g.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{g.name}</h3>
                  <Badge variant={g.min_select > count ? 'default' : 'secondary'} className="shrink-0">
                    {rule(g)}{g.max_select > 1 ? ` · ${count}/${g.max_select}` : ''}
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {g.options.filter(o => o.available).map(o => {
                    const on = selected.includes(o.id);
                    const full = !on && g.max_select > 1 && count >= g.max_select;
                    const shown = g.kind === 'flavor' ? o.price * sizeRatio : o.price;
                    return (
                      <button key={o.id} type="button" disabled={full} onClick={() => toggle(g, o.id)}
                        className={cn('flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                          on ? 'border-primary bg-primary/10' : 'hover:border-primary/40', full && 'opacity-50')}>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border',
                          g.max_select === 1 ? 'rounded-full' : 'rounded-md', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">{o.name}</span>
                        {!free && shown > 0 && (
                          <span className="shrink-0 text-muted-foreground">
                            {g.kind === 'extra' ? `+ ${brl(shown)}` : brl(shown)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {g.kind === 'flavor' && g.max_select > 1 && !free && (
                  <p className="text-[11px] text-muted-foreground">
                    Com mais de um sabor, vale o preço {g.pricing === 'avg' ? 'da média dos sabores' : 'do sabor mais caro'}.
                  </p>
                )}
              </section>
            );
          })}
          {withNotes && (
            <Textarea rows={2} maxLength={300} placeholder="Observação (ex.: sem cebola)" value={notes} onChange={e => setNotes(e.target.value)} />
          )}
          {quote.error && <p className="text-sm text-destructive">{quote.error}</p>}
        </div>
        <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" aria-label="Diminuir quantidade" onClick={() => setQty(q => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
            <span className="w-6 text-center font-semibold">{qty}</span>
            <Button size="icon" variant="outline" aria-label="Aumentar quantidade" onClick={() => setQty(q => Math.min(50, q + 1))}><Plus className="h-4 w-4" /></Button>
          </div>
          <Button className="flex-1 sm:flex-none" disabled={!!quote.error}
            onClick={() => onConfirm({ options: selected, options_text: quote.label, price: unit, quantity: qty, notes: notes.trim() })}>
            Adicionar · {free ? 'Incluso' : brl(unit * qty)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
