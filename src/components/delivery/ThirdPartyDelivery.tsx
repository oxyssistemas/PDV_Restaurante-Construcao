import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';

export const THIRD_PARTY = ['Lalamove', 'Loggi', 'Uber Direct', '99 Entrega', 'iFood Envios', 'Motoboy avulso', 'Outro'];

type Order = { id: string; third_party_provider?: string | null; third_party_tracking?: string | null; third_party_cost?: number | null };

/**
 * Entrega terceirizada: o pedido sai com um app de entrega (chamado no app/site do parceiro) e fica registrado aqui
 * com o parceiro, o custo e o link de rastreio. A chamada automática pelos apps depende de contrato com cada um.
 */
export default function ThirdPartyDelivery({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(order.third_party_provider ?? 'Lalamove');
  const [cost, setCost] = useState(order.third_party_cost != null ? String(order.third_party_cost) : '');
  const [tracking, setTracking] = useState(order.third_party_tracking ?? '');

  const save = useMutation({
    mutationFn: async (clear: boolean) => {
      const link = tracking.trim();
      if (!clear && link && !/^https?:\/\//i.test(link)) throw new Error('O link de rastreio deve começar com http:// ou https://');
      const { error } = await supabase.from('orders').update(clear
        ? { third_party_provider: null, third_party_cost: null, third_party_tracking: null }
        : { third_party_provider: provider, third_party_cost: cost.trim() ? Number(cost.replace(',', '.')) || 0 : null, third_party_tracking: link || null, courier_id: null },
      ).eq('id', order.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }); setOpen(false); toast.success('Entrega atualizada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {order.third_party_provider ? (
        <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px]">
          <Truck className="h-3 w-3" /> {order.third_party_provider}
          {order.third_party_cost != null && ` · custo R$ ${Number(order.third_party_cost).toFixed(2)}`}
          {order.third_party_tracking && <a className="underline" href={order.third_party_tracking} target="_blank" rel="noopener noreferrer">rastrear</a>}
          <button type="button" className="ml-auto underline" onClick={() => setOpen(true)}>alterar</button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="mt-1 h-7 w-full gap-1 text-xs" onClick={() => setOpen(true)}>
          <Truck className="h-3 w-3" /> Entrega terceirizada
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Entrega terceirizada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Parceiro</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{THIRD_PARTY.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tp-cost">Custo da corrida (R$)</Label>
              <Input id="tp-cost" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tp-link">Link de rastreio (opcional)</Label>
              <Input id="tp-link" placeholder="https://" value={tracking} onChange={e => setTracking(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Chame a corrida no app do parceiro e registre aqui. O pedido segue no quadro sem precisar de entregador da loja.</p>
          </div>
          <DialogFooter className="gap-2">
            {order.third_party_provider && <Button variant="outline" onClick={() => save.mutate(true)}>Voltar para entregador da loja</Button>}
            <Button disabled={save.isPending} onClick={() => save.mutate(false)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
