import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { usePrinterSettings } from '@/hooks/usePrinterSettings';
import {
  PrintPurpose, PrinterConfig, ThermalWidth, printPurposeLabels, printPurposes, printerModels, printOrderTicket,
} from '@/lib/printing';

const testOrder = {
  id: '00000000-teste',
  created_at: new Date().toISOString(),
  customer_name: 'Cliente teste',
  table_number: 1,
  order_type: 'dine_in',
  total: 42.5,
};

export default function PrinterSettingsCard({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const { data, isLoading, getConfig } = usePrinterSettings(restaurantId);
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<PrintPurpose, PrinterConfig>>(
    () => Object.fromEntries(printPurposes.map(p => [p, getConfig(p)])) as Record<PrintPurpose, PrinterConfig>
  );

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(printPurposes.map(p => [p, getConfig(p)])) as Record<PrintPurpose, PrinterConfig>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const patch = (purpose: PrintPurpose, values: Partial<PrinterConfig>) =>
    setDrafts(d => ({ ...d, [purpose]: { ...d[purpose], ...values } }));

  const save = useMutation({
    mutationFn: async (purpose: PrintPurpose) => {
      const c = drafts[purpose];
      const { error } = await supabase.from('printer_settings').upsert(
        {
          restaurant_id: restaurantId,
          purpose,
          enabled: c.enabled,
          model: c.model,
          device_name: c.device_name || null,
          width: c.width,
          copies: c.copies,
          header_note: c.header_note || null,
          footer_note: c.footer_note || null,
        },
        { onConflict: 'restaurant_id,purpose' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printer-settings'] });
      toast({ title: 'Impressora salva!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Impressoras térmicas</CardTitle>
        <CardDescription>
          Escolha o modelo e o mapeamento de impressora para cada tipo de impressão deste restaurante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {printPurposes.map(purpose => {
          const c = drafts[purpose];
          return (
            <div key={purpose} className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{printPurposeLabels[purpose]}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.enabled ? 'Impressão habilitada' : 'Impressão desativada'}
                  </div>
                </div>
                <Switch checked={c.enabled} onCheckedChange={v => patch(purpose, { enabled: v })} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select
                    value={c.model}
                    onValueChange={v => {
                      const m = printerModels.find(x => x.value === v);
                      patch(purpose, { model: v, width: m?.width ?? c.width });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {printerModels.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Largura do papel</Label>
                  <Select value={c.width} onValueChange={v => patch(purpose, { width: v as ThermalWidth })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58 mm</SelectItem>
                      <SelectItem value="80mm">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Impressora (nome no sistema)</Label>
                  <Input
                    value={c.device_name || ''}
                    placeholder="Ex.: EPSON TM-T20 Caixa 1"
                    onChange={e => patch(purpose, { device_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vias</Label>
                  <Input
                    type="number" min={1} max={5} value={c.copies}
                    onChange={e => patch(purpose, { copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cabeçalho extra</Label>
                  <Input value={c.header_note || ''} onChange={e => patch(purpose, { header_note: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Rodapé extra</Label>
                  <Input value={c.footer_note || ''} onChange={e => patch(purpose, { footer_note: e.target.value })} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate(purpose)}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                </Button>
                <Button
                  variant="outline" className="gap-2"
                  onClick={() =>
                    printOrderTicket({
                      restaurantName,
                      title: `Teste • ${printPurposeLabels[purpose]}`,
                      order: testOrder,
                      items: [{ name: 'Item de teste', quantity: 1, unit_price: 42.5 }],
                      config: { ...c, enabled: true },
                    })
                  }
                >
                  <Printer className="h-4 w-4" /> Imprimir teste
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
