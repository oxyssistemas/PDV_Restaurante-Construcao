import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Copy, Download, KeyRound, Loader2, Server } from 'lucide-react';
import { toast } from 'sonner';
import { edgeErrorMessage } from '@/lib/functionError';

type AgentStatus = { key: { key_hint: string; created_at: string; last_seen_at: string | null; agent_info: { host?: string; platform?: string; version?: string } | null } | null };

async function call<T>(restaurantId: string, action: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('print-agent', { body: { restaurantId, action } });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data && 'error' in data && data.error) throw new Error(String(data.error));
  return data as T;
}

/** Agente local de impressão: chave do restaurante, download e situação. */
export default function PrintAgentPanel({ restaurantId }: { restaurantId: string }) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ['print-agent', restaurantId],
    queryFn: () => call<AgentStatus>(restaurantId, 'status'),
    refetchInterval: 15_000,
  });
  const create = useMutation({
    mutationFn: () => call<{ key: string }>(restaurantId, 'create_key'),
    onSuccess: r => { setNewKey(r.key); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const key = data?.key;
  const online = !!key?.last_seen_at && Date.now() - new Date(key.last_seen_at).getTime() < 60_000;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Server className="h-4 w-4" />
        <p className="font-medium">Agente local</p>
        {key ? (
          <Badge variant={online ? 'secondary' : 'outline'}>
            {online ? `Conectado${key.agent_info?.host ? ` em ${key.agent_info.host}` : ''}` : key.last_seen_at
              ? `Visto pela última vez ${new Date(key.last_seen_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
              : 'Aguardando a primeira conexão'}
          </Badge>
        ) : <Badge variant="outline">Não configurado</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Para impressoras de rede (IP) ou USB sem a estação no navegador. Instale em <strong>um</strong> computador do restaurante
        que fique ligado; ele atende todas as impressoras do tipo "Agente local".
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Instale o <a href="https://nodejs.org/pt-br/download" target="_blank" rel="noreferrer" className="text-primary underline">Node.js (versão LTS)</a> no computador.</li>
        <li>Baixe os dois arquivos abaixo para uma pasta (ex.: Documentos\Oxys).</li>
        <li>Gere a chave, abra o <strong>iniciar-agente.bat</strong> e cole a chave quando pedir. Deixe a janela aberta.</li>
        <li>Cadastre as impressoras com o tipo "Agente local" e o endereço: o IP (ex.: 192.168.0.50) ou o nome da impressora instalada no Windows.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="gap-2"><a href="/agente/oxys-print-agent.mjs" download><Download className="h-4 w-4" /> oxys-print-agent.mjs</a></Button>
        <Button asChild size="sm" variant="outline" className="gap-2"><a href="/agente/iniciar-agente.bat" download><Download className="h-4 w-4" /> iniciar-agente.bat</a></Button>
        {key ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2"><KeyRound className="h-4 w-4" /> Gerar nova chave</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Gerar nova chave?</AlertDialogTitle>
                <AlertDialogDescription>A chave atual (final {key.key_hint}) para de funcionar. O agente precisará ser iniciado de novo com a nova chave.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => create.mutate()}>Gerar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button size="sm" className="gap-2" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Gerar chave
          </Button>
        )}
      </div>
      {newKey && (
        <div className="space-y-1.5 rounded-md bg-muted p-3">
          <p className="text-sm font-medium">Chave do agente (copie agora; ela não aparece de novo)</p>
          <div className="flex gap-2">
            <Input readOnly value={newKey} className="font-mono text-xs" onFocus={e => e.currentTarget.select()} />
            <Button size="icon" variant="outline" aria-label="Copiar"
              onClick={() => navigator.clipboard.writeText(newKey).then(() => toast.success('Chave copiada'))}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
