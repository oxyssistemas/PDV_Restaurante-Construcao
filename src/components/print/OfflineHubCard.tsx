import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CloudOff, Loader2, RefreshCw, ServerCog, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { desktop, type HubStatus } from '@/lib/desktop';

/**
 * Central do modo offline: este computador guarda a loja e, sem internet, atende garçons, cozinha e caixa
 * pela rede local. Só aparece no app de computador.
 */
export default function OfflineHubCard() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const isAdmin = currentRole?.role === 'admin' || currentRole?.role === 'super_admin';
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const { data: status, refetch } = useQuery({
    queryKey: ['hub-status'],
    enabled: !!desktop?.hubStatus,
    refetchInterval: 10_000,
    queryFn: () => desktop!.hubStatus!() as Promise<HubStatus>,
  });
  const url = status?.lanUrls?.[0] ?? null;
  useEffect(() => {
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [url]);

  if (!desktop?.hubStatus) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Modo offline</CardTitle>
          <CardDescription>Atualize o app Oxys Restaurante deste computador para usar a central do modo offline.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activate = async () => {
    if (!restaurantId || !/^\d{4,8}$/.test(pin)) { toast.error('Crie um PIN de 4 a 8 números.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('offline-hub', { body: { action: 'activate', restaurantId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      await desktop!.hubActivate!({
        key: data.key, restaurantId, pin,
        functionsUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offline-hub`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      });
      setPin('');
      toast.success('Este computador agora é a central do modo offline');
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ativar');
    } finally { setBusy(false); }
  };

  const deactivate = async () => {
    if (!restaurantId || !confirm('Desativar a central? Sem ela, a loja não funciona quando a internet cair.')) return;
    if ((status?.pendingOps ?? 0) > 0 && !confirm('Ainda há operações feitas offline que não foram enviadas. Desativar mesmo assim?')) return;
    await supabase.functions.invoke('offline-hub', { body: { action: 'deactivate', restaurantId } });
    await desktop!.hubDeactivate!();
    refetch();
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><ServerCog className="h-4 w-4" /> Central do modo offline</CardTitle>
          <CardDescription>Sem internet, garçons, cozinha e caixa continuam trabalhando pela rede da loja; tudo é enviado quando a internet voltar.</CardDescription>
        </div>
        {status?.enabled && (
          <Badge variant="outline" className={status.online ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'}>
            {status.online ? <><Wifi className="mr-1 h-3 w-3" /> Sincronizada</> : <><CloudOff className="mr-1 h-3 w-3" /> Sem internet</>}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!status?.enabled ? (
          isAdmin ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">Ative no computador que fica sempre ligado no caixa. Crie um PIN: a equipe usa ele para entrar no modo offline.</p>
              <div className="flex flex-wrap gap-2">
                <Input value={pin} inputMode="numeric" maxLength={8} placeholder="PIN (4 a 8 números)" className="w-48"
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
                <Button disabled={busy || pin.length < 4} onClick={activate}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ativar este computador
                </Button>
              </div>
            </div>
          ) : <p className="text-muted-foreground">Peça ao administrador para ativar a central neste computador.</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            {qr && <img src={qr} alt="QR Code do modo offline" className="h-32 w-32 shrink-0 rounded-lg bg-white p-1" />}
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-medium">Sem internet, abra nos celulares e tablets (mesmo Wi-Fi):</p>
              {(status.lanUrls ?? []).map(u => <p key={u} className="break-all font-mono text-primary">{u}</p>)}
              <p className="text-xs text-muted-foreground">
                Atualizada com a nuvem: {(status.snapshotAt || status.lastSyncAt) ? new Date((status.snapshotAt || status.lastSyncAt)!).toLocaleString('pt-BR') : 'ainda não'}
                {status.pendingOps ? ` · ${status.pendingOps} operação(ões) aguardando envio` : ''}
                {status.failedOps ? ` · ${status.failedOps} com erro` : ''}
              </p>
              {status.error && <p className="text-xs text-destructive">{status.error}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-2" onClick={async () => { await desktop!.hubSync!(); refetch(); }}><RefreshCw className="h-4 w-4" /> Sincronizar agora</Button>
                {isAdmin && <Button size="sm" variant="ghost" className="text-destructive" onClick={deactivate}>Desativar</Button>}
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">No Windows, permita o acesso à rede quando o firewall perguntar na primeira vez.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
