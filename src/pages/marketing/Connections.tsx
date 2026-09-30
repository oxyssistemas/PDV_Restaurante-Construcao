import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Link2, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import ModuleGate from '@/components/ModuleGate';
import NetworkIcon from '@/components/marketing/NetworkIcon';
import { marketingApi, marketingConfig, startConnect, type Network, type Provider } from '@/lib/marketing';

type Account = { id: string; provider: string; kind: string; name: string | null; selected: boolean };

const PROVIDERS: { key: Provider; title: string; description: string; networks: { network: Network; kind: string; empty: string }[] }[] = [
  {
    key: 'meta',
    title: 'Meta',
    description: 'Facebook e Instagram em um único login. O Instagram precisa ser uma conta Profissional ligada a uma Página.',
    networks: [
      { network: 'facebook', kind: 'facebook_page', empty: 'Nenhuma Página do Facebook encontrada nesta conta.' },
      { network: 'instagram', kind: 'instagram', empty: 'Nenhum Instagram Profissional ligado às suas Páginas.' },
    ],
  },
  {
    key: 'tiktok',
    title: 'TikTok',
    description: 'Publica vídeos e fotos no perfil conectado.',
    networks: [{ network: 'tiktok', kind: 'tiktok', empty: 'Conta não encontrada.' }],
  },
];

export default function MarketingConnections() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  // Retorno do login da rede social
  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('connect_error');
    if (!connected && !error) return;
    if (connected) toast.success(`Conta ${connected === 'tiktok' ? 'do TikTok' : 'da Meta'} conectada`);
    if (error) toast.error(error);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const { data: config } = useQuery({ queryKey: ['marketing-config'], queryFn: marketingConfig, staleTime: 5 * 60_000 });

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ['marketing-status', restaurantId],
    enabled: !!restaurantId,
    queryFn: () => marketingApi(restaurantId!, 'status') as Promise<{ credentials: { provider: string; expired: boolean }[] }>,
  });

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['marketing-accounts', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_accounts')
        .select('id, provider, kind, name, selected')
        .eq('restaurant_id', restaurantId!)
        .in('kind', ['facebook_page', 'instagram', 'tiktok'])
        .order('name');
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['marketing-status'] });
    qc.invalidateQueries({ queryKey: ['marketing-accounts'] });
    qc.invalidateQueries({ queryKey: ['marketing-overview'] });
  };

  const connect = useMutation({
    mutationFn: (provider: Provider) => startConnect(restaurantId!, provider),
    onError: (e: Error) => toast.error(e.message),
  });

  const select = useMutation({
    mutationFn: (accountId: string) => marketingApi(restaurantId!, 'select_account', { accountId }),
    onSuccess: () => { refresh(); toast.success('Conta selecionada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (provider: Provider) => marketingApi(restaurantId!, 'disconnect', { provider }),
    onSuccess: () => { refresh(); toast.success('Conta desconectada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  const loading = loadingStatus || loadingAccounts;

  return (
    <ModuleGate module="marketing">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conexões</h1>
          <p className="text-muted-foreground">Conecte as redes sociais do restaurante para publicar direto por aqui.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {PROVIDERS.map(p => {
              const cred = status?.credentials.find(c => c.provider === p.key);
              const available = config?.configured?.[p.key] ?? false;
              const expired = !!cred?.expired;
              return (
                <Card key={p.key}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {p.networks.map(n => <NetworkIcon key={n.network} network={n.network} className="h-5 w-5" />)}
                        {p.title}
                      </CardTitle>
                      <CardDescription>{p.description}</CardDescription>
                    </div>
                    {!available && !cred ? (
                      <Badge variant="outline">Aguardando liberação</Badge>
                    ) : cred ? (
                      <Badge variant={expired ? 'destructive' : 'secondary'}>{expired ? 'Acesso expirado' : 'Conectado'}</Badge>
                    ) : (
                      <Badge variant="outline">Não conectado</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cred && p.networks.map(n => {
                      const list = (accounts || []).filter(a => a.kind === n.kind);
                      const current = list.find(a => a.selected);
                      return (
                        <div key={n.network} className="space-y-1.5">
                          <p className="flex items-center gap-2 text-sm font-medium"><NetworkIcon network={n.network} /> {n.network === 'facebook' ? 'Página do Facebook' : n.network === 'instagram' ? 'Instagram' : 'Perfil'}</p>
                          {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{n.empty}</p>
                          ) : list.length === 1 ? (
                            <p className="text-sm text-muted-foreground">{list[0].name}</p>
                          ) : (
                            <Select value={current?.id} onValueChange={id => select.mutate(id)} disabled={select.isPending}>
                              <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                              <SelectContent>
                                {list.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}

                    {!available && !cred && (
                      <p className="text-sm text-muted-foreground">A integração com {p.title} ainda não foi ativada pelo Oxys.</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {(available || cred) && (
                        <Button size="sm" className="gap-2" variant={cred && !expired ? 'outline' : 'default'}
                          disabled={!available || connect.isPending} onClick={() => connect.mutate(p.key)}>
                          {connect.isPending && connect.variables === p.key
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : cred ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                          {cred ? 'Reconectar' : 'Conectar'}
                        </Button>
                      )}
                      {cred && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="gap-2"><Unlink className="h-4 w-4" /> Desconectar</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Desconectar {p.title}?</AlertDialogTitle>
                              <AlertDialogDescription>Publicações agendadas para estas redes vão falhar até você conectar de novo.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => disconnect.mutate(p.key)}>Desconectar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ModuleGate>
  );
}
