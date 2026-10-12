import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Scale } from 'lucide-react';
import { readScale, scaleSupported } from '@/lib/scale';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Peso do prato por quilo: digitado (kg ou gramas) ou lido da balança. Devolve o peso e o valor. */
export default function WeightDialog({ item, onClose, onConfirm }: {
  item: { id: string; name: string; price: number } | null;
  onClose: () => void;
  onConfirm: (weightKg: number, total: number) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (item) { setValue(''); setErr(null); } }, [item]);
  if (!item) return null;

  // "452" = gramas; "0,452" = kg
  const raw = Number(value.replace(',', '.'));
  const kg = !value ? 0 : value.includes(',') || value.includes('.') ? raw : raw >= 20 ? raw / 1000 : raw;
  const total = Math.round(kg * Number(item.price) * 100) / 100;

  const read = async () => {
    setBusy(true); setErr(null);
    try { setValue(String((await readScale()).toFixed(3)).replace('.', ',')); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{item.name} · {brl(Number(item.price))}/kg</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="weight">Peso (kg ou gramas)</Label>
            <Input id="weight" autoFocus inputMode="decimal" className="h-14 text-2xl" placeholder="0,452" value={value}
              onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
          </div>
          {scaleSupported() && (
            <Button type="button" variant="outline" className="w-full gap-2" disabled={busy} onClick={read}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />} Ler da balança
            </Button>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <p className="text-center text-lg">{kg > 0 ? <>{kg.toFixed(3).replace('.', ',')} kg = <b>{brl(total)}</b></> : 'Digite ou leia o peso'}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!(kg > 0 && kg < 50)} onClick={() => onConfirm(Math.round(kg * 1000) / 1000, total)}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
