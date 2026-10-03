import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, Loader2, ServerCog, Trash2, Unplug } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { edgeErrorMessage } from '@/lib/functionError';
import { SERVER_DOWNLOADS } from '@/lib/desktop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

export type DedicatedServerRow = Tables<'dedicated_servers'>;

export const DEDICATED_STATUS: Record<string, { label: string; tone: string }> = {
  awaiting: { label: 'Aguardando instalação', tone: 'border-amber-500/40 text-amber-400' },
  migrating: { label: 'Migrando dados', tone: 'border-sky-500/40 text-sky-400' },
  active: { label: 'Ativo', tone: 'border-emerald-500/40 text-emerald-400' },
  suspended: { label: 'Suspenso', tone: 'border-red-500/40 text-red-400' },
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('dedicated-server', { body });
  if (error) throw new Error(await edgeErrorMessage(error, 'Não foi possível concluir.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

const ago = (iso: string | null) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : new Date(iso).toLocaleString('pt-BR');
};

/**
 * Servidor dedicado de uma loja (recurso contratado): liberar, gerar o código de instalação, acompanhar a
 * migração e, depois de conferido, apagar os dados da loja da nuvem compartilhada.
 */
export default function DedicatedServerDialog({ restaurantId, restaurantName, server }: {
  restaurantId: string; restaurantName: string; server: DedicatedServerRow | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['super-admin-dedicated'] });
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); } catch (e) { toast({ title: 'Erro', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    finally { setBusy(null); refresh(); }
  };

  const enabled = !!server?.enabled;
  const status = server ? DEDICATED_STATUS[server.status] : null;
  const online = server?.last_seen_at && Date.now() - Date.parse(server.last_seen_at) < 3 * 60_000;

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" /> Servidor dedicado — {restaurantName}</DialogTitle>
        <DialogDescription>
          Os dados desta loja passam a ficar num servidor instalado no computador dela (banco próprio, funciona sem internet),
          não na nuvem compartilhada. A equipe continua entrando por oxysrestaurante.app.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="font-medium">Recurso contratado</p>
          <p className="text-xs text-muted-foreground">Só lojas liberadas aqui podem instalar o servidor.</p>
        </div>
        <Switch checked={enabled} disabled={busy !== null}
          onCheckedChange={(v) => run('enable', async () => { await call({ action: 'enable', restaurantId, enabled: v }); toast({ title: v ? 'Servidor dedicado liberado' : 'Servidor dedicado desativado' }); })} />
      </div>

      {server && enabled && (
        <>
          <div className="space-y-1.5 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Situação</span>
              {status && <Badge variant="outline" className={status.tone}>{status.label}</Badge>}
            </div>
            <p className="text-muted-foreground">Último contato: {ago(server.last_seen_at)}{server.last_seen_at && (online ? ' · online' : ' · sem contato')}{server.version ? ` · versão ${server.version}` : ''}</p>
            {server.public_url && <p className="break-all">Internet: <span className="font-mono text-primary">{server.public_url}</span></p>}
            {!!server.lan_urls?.length && <p className="break-all">Rede da loja: <span className="font-mono">{server.lan_urls.join('  ')}</span></p>}
            {server.migrated_at && <p>Migração: {server.migrated_rows ?? 0} registros em {new Date(server.migrated_at).toLocaleString('pt-BR')}</p>}
            {server.own_supabase_url && <p className="break-all">Supabase próprio: <span className="font-mono">{server.own_supabase_url}</span></p>}
            {server.cloud_purged_at && <p className="text-emerald-400">Dados apagados da nuvem compartilhada em {new Date(server.cloud_purged_at).toLocaleString('pt-BR')}</p>}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">Instalar o servidor na loja</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Baixe e instale o <b>Oxys Servidor</b> no computador que fica sempre ligado na loja.</li>
              <li>Gere o código abaixo e digite no Oxys Servidor (vale 24 h, uma vez só).</li>
              <li>O servidor copia todos os dados da loja e, ao terminar, a equipe passa a usar ele automaticamente.</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm"><a href={SERVER_DOWNLOADS.windows}><Download className="mr-1.5 h-3.5 w-3.5" /> Windows</a></Button>
              <Button asChild variant="outline" size="sm"><a href={SERVER_DOWNLOADS.linux}><Download className="mr-1.5 h-3.5 w-3.5" /> Linux (.deb)</a></Button>
              <Button asChild variant="outline" size="sm"><a href={SERVER_DOWNLOADS.mac}><Download className="mr-1.5 h-3.5 w-3.5" /> Mac</a></Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" disabled={busy !== null}
                onClick={() => run('code', async () => { const r = await call({ action: 'code', restaurantId }); setCode(r.code); })}>
                {busy === 'code' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
                Gerar código de instalação
              </Button>
              {code && (
                <button type="button" onClick={() => { navigator.clipboard?.writeText(code); toast({ title: 'Código copiado' }); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 font-mono text-lg font-bold tracking-widest">
                  {code} <Copy className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {server.key_hash && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null}
                onClick={() => confirmThen('Desligar o servidor instalado? Ele para de receber a equipe até ser ativado de novo com um código novo.',
                  () => run('unlink', async () => { await call({ action: 'unlink', restaurantId }); toast({ title: 'Servidor desligado' }); }))}>
                <Unplug className="mr-1.5 h-3.5 w-3.5" /> Desligar servidor instalado (para reinstalar)
              </Button>
            )}
          </div>

          {server.status === 'active' && server.migrated_at && !server.cloud_purged_at && (
            <div className="space-y-2 rounded-lg border border-red-500/30 p-3">
              <p className="font-medium text-red-400">Apagar os dados da loja da nuvem compartilhada</p>
              <p className="text-xs text-muted-foreground">
                Faça isso depois de conferir que está tudo certo no servidor da loja. Pedidos, cardápio, clientes, caixa, estoque e financeiro
                desta loja são apagados da nuvem; equipe, login e plano continuam. Não dá para desfazer.
              </p>
              <Label className="text-xs">Digite o nome da loja para confirmar</Label>
              <div className="flex flex-wrap gap-2">
                <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={restaurantName} className="max-w-xs" />
                <Button variant="destructive" disabled={busy !== null || confirm.trim() !== restaurantName.trim()}
                  onClick={() => run('purge', async () => { const r = await call({ action: 'purge', restaurantId, confirm }); toast({ title: `${r.removed} registros apagados da nuvem` }); setConfirm(''); })}>
                  {busy === 'purge' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Apagar da nuvem
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function confirmThen(message: string, fn: () => void) { if (window.confirm(message)) fn(); }
