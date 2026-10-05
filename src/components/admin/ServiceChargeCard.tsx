import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { useServiceSettings } from '@/lib/serviceCharge';

/** Taxa de serviço (10%) e couvert por pessoa. */
export default function ServiceChargeCard({ restaurantId }: { restaurantId: string }) {
  const { user, currentRole } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useServiceSettings(restaurantId);
  const [form, setForm] = useState({
    service_enabled: false, service_percent: '10', service_on_delivery: false,
    couvert_enabled: false, couvert_amount: '0', couvert_label: 'Couvert artístico',
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      service_enabled: settings.service_enabled, service_percent: String(settings.service_percent),
      service_on_delivery: settings.service_on_delivery, couvert_enabled: settings.couvert_enabled,
      couvert_amount: String(settings.couvert_amount), couvert_label: settings.couvert_label,
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const percent = Number(form.service_percent.replace(',', '.'));
      const amount = Number(form.couvert_amount.replace(',', '.'));
      if (!(percent >= 0 && percent <= 30)) throw new Error('A taxa de serviço deve ficar entre 0% e 30%.');
      if (!(amount >= 0)) throw new Error('Valor do couvert inválido.');
      const { error } = await supabase.from('service_settings').upsert({
        restaurant_id: restaurantId, service_enabled: form.service_enabled, service_percent: percent,
        service_on_delivery: form.service_on_delivery, couvert_enabled: form.couvert_enabled, couvert_amount: amount,
        couvert_label: form.couvert_label.trim() || 'Couvert', updated_by: user?.id ?? null,
      });
      if (error) throw error;
      await logAudit({
        restaurantId, role: currentRole?.role, action: 'update', entity: 'settings', entityId: restaurantId,
        summary: `Taxa de serviço ${form.service_enabled ? `${percent}%` : 'desligada'} • couvert ${form.couvert_enabled ? `R$ ${amount.toFixed(2)}/pessoa` : 'desligado'}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-settings', restaurantId] });
      toast.success('Taxa de serviço e couvert salvos.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Taxa de serviço e couvert</CardTitle>
        <CardDescription>
          Somados na conta da mesa no caixa. A taxa de serviço é opcional para o cliente: o caixa pode retirá-la na hora do pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
          <>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium">Cobrar taxa de serviço</span>
                <Switch checked={form.service_enabled} onCheckedChange={v => setForm({ ...form, service_enabled: v })} />
              </label>
              {form.service_enabled && (
                <div className="max-w-[200px] space-y-1.5">
                  <Label>Percentual (%)</Label>
                  <Input type="number" min="0" max="30" step="0.5" value={form.service_percent}
                    onChange={e => setForm({ ...form, service_percent: e.target.value })} />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium">Cobrar couvert por pessoa</span>
                <Switch checked={form.couvert_enabled} onCheckedChange={v => setForm({ ...form, couvert_enabled: v })} />
              </label>
              {form.couvert_enabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nome na conta</Label>
                    <Input value={form.couvert_label} maxLength={40} onChange={e => setForm({ ...form, couvert_label: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor por pessoa (R$)</Label>
                    <Input type="number" min="0" step="0.5" value={form.couvert_amount}
                      onChange={e => setForm({ ...form, couvert_amount: e.target.value })} />
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    O caixa informa quantas pessoas estão na mesa (começa pela capacidade da mesa).
                  </p>
                </div>
              )}
            </div>

            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
