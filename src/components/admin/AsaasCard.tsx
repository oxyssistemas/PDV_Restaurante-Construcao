import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Barcode, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { edgeErrorMessage } from '@/lib/functionError';

/** Conta Asaas da loja: boleto e Pix das contas a receber, com baixa automática pelo aviso (webhook). */
export default function AsaasCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const { data: status } = useQuery({
    queryKey: ['finance-integration', restaurantId],
    queryFn: async () => (await supabase.rpc('finance_integration_status', { _restaurant_id: restaurantId })).data as { asaas?: boolean; sandbox?: boolean } | null,
  });
  const { data: hook } = useQuery({
    queryKey: ['asaas-webhook', restaurantId, status?.asaas],
    enabled: !!status?.asaas,
    queryFn: async () => ((await supabase.functions.invoke('asaas', { body: { action: 'webhook_url', restaurantId } })).data as { webhookUrl?: string } | null)?.webhookUrl ?? null,
  });
  const save = useMutation({
    mutationFn: async (apiKey: string) => {
      const { data, error } = await supabase.functions.invoke('asaas', { body: { action: 'save_key', restaurantId, apiKey, sandbox } });
      const msg = error ? await edgeErrorMessage(error) : (data as { error?: string })?.error;
      if (msg) throw new Error(msg);
    },
    onSuccess: () => { setKey(''); qc.invalidateQueries({ queryKey: ['finance-integration', restaurantId] }); toast.success('Conta Asaas salva'); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Barcode className="h-5 w-5 text-primary" /> Boleto e Pix (Asaas)</CardTitle>
        <CardDescription>Gere boleto e Pix das contas a receber pela sua conta Asaas. A chave fica guardada só no servidor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{status?.asaas ? `✓ Conta ligada${status.sandbox ? ' (modo de testes)' : ''}.` : 'Nenhuma conta ligada.'}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <Label htmlFor="asaas-key">Chave de API do Asaas</Label>
            <Input id="asaas-key" type="password" autoComplete="off" placeholder={status?.asaas ? 'Trocar a chave' : '$aact_...'} value={key} onChange={e => setKey(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={sandbox} onCheckedChange={setSandbox} /> Conta de testes (sandbox)</label>
          <Button disabled={!key.trim() || save.isPending} onClick={() => save.mutate(key.trim())}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar</Button>
          {status?.asaas && <Button variant="ghost" className="text-destructive" onClick={() => save.mutate('')}>Desligar</Button>}
        </div>
        {hook && (
          <div className="space-y-1">
            <Label>Endereço do aviso de pagamento (cole no Asaas → Integrações → Webhooks, eventos de cobrança)</Label>
            <div className="flex gap-2"><Input readOnly value={hook} className="font-mono text-xs" />
              <Button size="icon" variant="outline" aria-label="Copiar endereço" onClick={() => { navigator.clipboard?.writeText(hook); toast.success('Copiado'); }}><Copy className="h-4 w-4" /></Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
